// ===== 靓图 表情包工具箱 - 多图层引擎 v3 =====

// ---- 状态 ----
let bgImage = null; let canvasW = 0, canvasH = 0; let hasImage = false;
let currentTool = 'crop';
let history = []; let historyIdx = -1; const MAX_HISTORY = 50;

// 图层系统
let layers = [];           // [{id,type:'text',text,fontSize,fontFamily,textColor,strokeColor,strokeWidth,rotation,x,y}]
let activeLayerIdx = -1;   // 当前选中图层
let layerIdCounter = 0;

// 拖拽
let dragging = false; let dragStartX = 0, dragStartY = 0; let dragObjStartX = 0, dragObjStartY = 0;

// 水印
let watermarkObj = null;

// DOM
const canvasArea = document.getElementById('canvasArea');
const dropOverlay = document.getElementById('dropOverlay');
const fileInput = document.getElementById('fileInput');
const mainCanvas = document.getElementById('mainCanvas');
const ctx = mainCanvas.getContext('2d');

// ---- 图层工具函数 ----
function activeLayer() { return layers[activeLayerIdx] || null; }
function nextLayerId() { return 'l' + (++layerIdCounter); }

// ---- 初始化 ----
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => switchTool(btn.dataset.tool));
  });
  dropOverlay.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => { if (e.target.files[0]) loadImage(e.target.files[0]); });
  canvasArea.addEventListener('dragover', e => { e.preventDefault(); });
  canvasArea.addEventListener('drop', e => {
    e.preventDefault(); const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) loadImage(f);
  });
  const textInput = document.getElementById('textInput');
  textInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addTextLayer(textInput.value); }
  });
  mainCanvas.addEventListener('mousedown', onMouseDown);
  mainCanvas.addEventListener('mousemove', onMouseMove);
  mainCanvas.addEventListener('mouseup', onMouseUp);
  mainCanvas.addEventListener('mouseleave', onMouseUp);
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if ((e.ctrlKey||e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if ((e.ctrlKey||e.metaKey) && (e.key==='y'||(e.key==='z'&&e.shiftKey))) { e.preventDefault(); redo(); }
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteActiveLayer(); }
  });
});

// ---- 图层列表UI ----
function refreshLayerList() {
  const list = document.getElementById('layerList');
  if (!hasImage) { list.innerHTML = '<div class="layer-empty">上传图片后<br>图层出现在这里</div>'; return; }
  let html = '';
  // 背景层
  html += `<div class="layer-item ${activeLayerIdx === -2 ? 'active' : ''}" onclick="selectBgLayer()">
    <span class="layer-icon">🖼</span><span class="layer-name">背景</span></div>`;
  // 文字层
  layers.forEach((l, i) => {
    const txt = l.text.length > 8 ? l.text.slice(0,8)+'…' : l.text;
    html += `<div class="layer-item ${i === activeLayerIdx ? 'active' : ''}" 
      onclick="selectLayer(${i})" ondblclick="renameLayer(${i})">
      <span class="layer-icon">✏️</span><span class="layer-name">${txt||'文字'}</span>
      <button class="layer-del" onclick="event.stopPropagation();deleteLayer(${i})" title="删除">×</button></div>`;
  });
  list.innerHTML = html;
}

function selectLayer(idx) {
  if (idx === activeLayerIdx) return;
  activeLayerIdx = idx;
  currentTool = 'text';
  document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector('.tool-btn[data-tool="text"]');
  if (btn) btn.classList.add('active');
  switchTool('text');
  syncLayerControls();
  refreshLayerList();
  render();
}

function selectBgLayer() {
  activeLayerIdx = -2;
  document.getElementById('textControls').style.display = 'none';
  document.getElementById('textNoLayer').style.display = 'block';
  refreshLayerList();
  render();
}

function renameLayer(idx) {
  const l = layers[idx];
  if (!l) return;
  const t = prompt('图层名称：', l.text.slice(0,20));
  if (t && t.trim()) { l.text = t.trim(); pushHistory(); refreshLayerList(); render(); }
}

function deleteLayer(idx) {
  if (idx < 0 || idx >= layers.length) return;
  pushHistory();
  layers.splice(idx, 1);
  if (activeLayerIdx >= layers.length) activeLayerIdx = layers.length - 1;
  refreshLayerList();
  if (activeLayerIdx < 0) {
    document.getElementById('textControls').style.display = 'none';
    document.getElementById('textNoLayer').style.display = 'block';
  }
  render();
}

function deleteActiveLayer() {
  if (activeLayerIdx < 0) return;
  deleteLayer(activeLayerIdx);
}

// ---- 图片加载 ----
function loadImage(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      bgImage = img; canvasW = img.width; canvasH = img.height; hasImage = true;
      window.__lt && window.__lt.action('upload');
      layers = []; activeLayerIdx = -1; layerIdCounter = 0;
      history = []; historyIdx = -1; pushHistory();
      setupCanvas(); render(); updateInfo();
      canvasArea.classList.remove('empty');
      refreshLayerList();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function setupCanvas() {
  const areaW = canvasArea.clientWidth - 40;
  const areaH = canvasArea.clientHeight - 40;
  const scale = Math.min(areaW / canvasW, areaH / canvasH, 1);
  mainCanvas.style.width = (canvasW * scale) + 'px';
  mainCanvas.style.height = (canvasH * scale) + 'px';
  mainCanvas.width = canvasW; mainCanvas.height = canvasH;
  mainCanvas.style.display = 'block';
}

// ---- 渲染 ----
function render() {
  if (!hasImage) return;
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.drawImage(bgImage, 0, 0);
  // 画所有文字图层
  layers.forEach((l, i) => drawTextLayer(l, i === activeLayerIdx));
  // 水印
  if (watermarkObj && watermarkObj.text) drawWatermarkLayer(ctx, watermarkObj);
}

function drawTextLayer(l, isSelected) {
  ctx.save();
  const sw = l.strokeWidth >= 0 ? l.strokeWidth : Math.max(2, l.fontSize * 0.08);
  ctx.font = `bold ${l.fontSize}px "${l.fontFamily}",sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.translate(l.x, l.y);
  if (l.rotation) ctx.rotate(l.rotation * Math.PI / 180);
  ctx.strokeStyle = l.strokeColor; ctx.lineWidth = sw; ctx.lineJoin = 'round';
  ctx.strokeText(l.text, 0, 0);
  ctx.fillStyle = l.textColor;
  ctx.fillText(l.text, 0, 0);
  if (isSelected) {
    const metrics = ctx.measureText(l.text);
    const tw = metrics.width, th = l.fontSize;
    ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.strokeRect(-tw/2 - 6, -th/2 - 4, tw + 12, th + 8);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

// ---- 文字图层操作 ----
function addTextLayer(t) {
  if (!hasImage) { document.getElementById('textNoLayer').textContent = '⚠️ 请先上传图片'; return; }
  t = t ? t.trim() : '';
  pushHistory();
  const layer = {
    id: nextLayerId(), type: 'text',
    text: t || '双击编辑',
    x: canvasW / 2, y: canvasH - 40,
    fontSize: Math.max(24, Math.round(canvasW / 15)),
    fontFamily: 'Microsoft YaHei', textColor: '#FFFFFF', strokeColor: '#000000',
    strokeWidth: 2, rotation: 0
  };
  layers.push(layer);
  activeLayerIdx = layers.length - 1;
  document.getElementById('textInput').value = '';
  document.getElementById('textControls').style.display = 'block';
  document.getElementById('textNoLayer').style.display = 'none';
  syncLayerControls();
  refreshLayerList();
  render();
}

// ---- 鼠标交互（多图层检测）----
function hitTestLayer(mx, my) {
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    ctx.save();
    ctx.font = `bold ${l.fontSize}px "${l.fontFamily}",sans-serif`;
    const metrics = ctx.measureText(l.text);
    const tw = metrics.width, th = l.fontSize;
    ctx.restore();
    // 考虑旋转简化：不旋转时直接矩形检测
    if (!l.rotation) {
      if (mx > l.x - tw/2 - 10 && mx < l.x + tw/2 + 10 &&
          my > l.y - th/2 - 10 && my < l.y + th/2 + 10) return i;
    } else {
      // 旋转时用距离检测
      const dx = mx - l.x, dy = my - l.y;
      const rad = l.rotation * Math.PI / 180;
      const rx = dx * Math.cos(-rad) - dy * Math.sin(-rad);
      const ry = dx * Math.sin(-rad) + dy * Math.cos(-rad);
      if (Math.abs(rx) < tw/2 + 10 && Math.abs(ry) < th/2 + 10) return i;
    }
  }
  return -1;
}

function onMouseDown(e) {
  if (!hasImage) return;
  const rect = mainCanvas.getBoundingClientRect();
  const scaleX = canvasW / rect.width, scaleY = canvasH / rect.height;
  const mx = (e.clientX - rect.left) * scaleX, my = (e.clientY - rect.top) * scaleY;

  if (currentTool === 'text') {
    const hit = hitTestLayer(mx, my);
    if (hit >= 0) {
      selectLayer(hit);
      dragging = true;
      dragStartX = mx; dragStartY = my;
      dragObjStartX = layers[hit].x; dragObjStartY = layers[hit].y;
      mainCanvas.style.cursor = 'grabbing';
    } else {
      activeLayerIdx = -1;
      document.getElementById('textControls').style.display = 'none';
      document.getElementById('textNoLayer').style.display = 'block';
      refreshLayerList();
      render();
    }
  }
}

function onMouseMove(e) {
  if (!hasImage) return;
  const rect = mainCanvas.getBoundingClientRect();
  const scaleX = canvasW / rect.width, scaleY = canvasH / rect.height;
  const mx = (e.clientX - rect.left) * scaleX, my = (e.clientY - rect.top) * scaleY;

  if (dragging && activeLayerIdx >= 0) {
    const l = layers[activeLayerIdx];
    if (l) {
      l.x = dragObjStartX + (mx - dragStartX);
      l.y = dragObjStartY + (my - dragStartY);
      render();
    }
    return;
  }
  // hover 检测
  if (!dragging && currentTool === 'text') {
    const hit = hitTestLayer(mx, my);
    mainCanvas.style.cursor = hit >= 0 ? 'grab' : 'default';
  }
}

function onMouseUp() {
  if (dragging) { dragging = false; mainCanvas.style.cursor = 'default'; pushHistory(); }
}

// ---- 文字属性控件同步 ----
function syncLayerControls() {
  const l = activeLayer();
  if (!l) return;
  document.getElementById('fontSizeSlider').value = l.fontSize;
  document.getElementById('fontSizeVal').textContent = l.fontSize + 'px';
  document.getElementById('fontFamily').value = l.fontFamily;
  document.getElementById('textColor').value = l.textColor;
  document.getElementById('strokeColor').value = l.strokeColor;
  const sw = l.strokeWidth >= 0 ? l.strokeWidth : Math.max(2, l.fontSize * 0.08);
  document.getElementById('strokeWidthSlider').value = sw;
  document.getElementById('strokeWidthVal').textContent = Math.round(sw) + 'px';
  document.getElementById('rotationSlider').value = l.rotation || 0;
  document.getElementById('rotationVal').textContent = (l.rotation||0) + '°';
}

function updateFontSize(val) {
  const l = activeLayer(); if (!l) return; pushHistory();
  l.fontSize = parseInt(val); render();
}
function updateFontFamily(val) {
  const l = activeLayer(); if (!l) return; pushHistory();
  l.fontFamily = val; render();
}
function updateTextColor(val) {
  const l = activeLayer(); if (!l) return; pushHistory();
  l.textColor = val; render();
}
function updateStrokeColor(val) {
  const l = activeLayer(); if (!l) return; pushHistory();
  l.strokeColor = val; render();
}
function updateStrokeWidth(val) {
  const l = activeLayer(); if (!l) return; pushHistory();
  l.strokeWidth = parseInt(val); render();
}
function updateRotation(val) {
  const l = activeLayer(); if (!l) return; pushHistory();
  l.rotation = parseInt(val); render();
}

// ---- 历史 ----
function pushHistory() { if (!hasImage) return;
  history = history.slice(0, historyIdx + 1);
  history.push(serializeState());
  if (history.length > MAX_HISTORY) history.shift(); else historyIdx++;
}
function serializeState() {
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = canvasW; tmpCanvas.height = canvasH;
  tmpCanvas.getContext('2d').drawImage(bgImage, 0, 0);
  return { bgDataUrl: tmpCanvas.toDataURL(), canvasW, canvasH,
    layers: layers.map(l => ({...l})), activeLayerIdx };
}
function restoreState(state) {
  canvasW = state.canvasW; canvasH = state.canvasH;
  layers = (state.layers || []).map(l => ({...l}));
  activeLayerIdx = state.activeLayerIdx != null ? state.activeLayerIdx : -1;
  bgImage = new Image(); bgImage.src = state.bgDataUrl;
  bgImage.onload = () => { setupCanvas(); render(); updateInfo(); };
  setupCanvas(); render(); updateInfo(); refreshLayerList();
}
function undo() {
  if (historyIdx < 0) return; historyIdx--;
  if (historyIdx < 0) { resetAll(); return; }
  restoreState(history[historyIdx]);
}
function redo() {
  if (historyIdx >= history.length - 1) return;
  historyIdx++; restoreState(history[historyIdx]);
}

// ---- 工具切换 ----
function switchTool(tool) {
  currentTool = tool;
  window.__lt && window.__lt.action('process', {tool});
  document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.tool-btn[data-tool="${tool}"]`);
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.props-panel').forEach(p => p.classList.remove('active'));
  const panelMap = { crop:'panelCrop', text:'panelText', bg:'panelBg', flip:'panelFlip',
    filter:'panelFilter', adjust:'panelAdjust', watermark:'panelWatermark', compress:'panelCompress' };
  const panelId = panelMap[tool];
  if (panelId) document.getElementById(panelId).classList.add('active');
  mainCanvas.style.cursor = 'default';
  if (tool === 'text' && activeLayerIdx >= 0) {
    document.getElementById('textControls').style.display = 'block';
    document.getElementById('textNoLayer').style.display = 'none';
    syncLayerControls();
  } else if (tool === 'text') {
    document.getElementById('textControls').style.display = 'none';
    document.getElementById('textNoLayer').style.display = 'block';
    document.getElementById('textNoLayer').textContent = hasImage
      ? '点击画布上的文字选中，或输入文字创建新图层'
      : '⚠️ 请先上传图片';
  }
  render();
}

// ---- 白底 ----
function applyWhiteBg() { if(!hasImage)return; pushHistory();
  const imgData=ctx.getImageData(0,0,canvasW,canvasH); const d=imgData.data;
  const corners=[[5,5],[canvasW-5,5],[5,canvasH-5],[canvasW-5,canvasH-5]];
  let r=0,g=0,b=0,c=0; corners.forEach(([cx,cy])=>{if(cx<canvasW&&cy<canvasH){const i=(cy*canvasW+cx)*4;r+=d[i];g+=d[i+1];b+=d[i+2];c++;}});
  r/=c;g/=c;b/=c; const tol=40;
  for(let i=0;i<d.length;i+=4){if(Math.abs(d[i]-r)<tol&&Math.abs(d[i+1]-g)<tol&&Math.abs(d[i+2]-b)<tol){d[i]=255;d[i+1]=255;d[i+2]=255;}}
  const t=document.createElement('canvas');t.width=canvasW;t.height=canvasH;t.getContext('2d').putImageData(imgData,0,0);
  bgImage=new Image();bgImage.src=t.toDataURL();bgImage.onload=()=>render();render();
}
function applyTransparentToWhite() { if(!hasImage)return; pushHistory();
  const t=document.createElement('canvas');t.width=canvasW;t.height=canvasH;const tc=t.getContext('2d');
  tc.fillStyle='#FFFFFF';tc.fillRect(0,0,canvasW,canvasH);tc.drawImage(bgImage,0,0);
  bgImage=new Image();bgImage.src=t.toDataURL();bgImage.onload=()=>render();render();
}

// ---- 裁剪 ----
let cropOrigW = 0, cropOrigH = 0;
function doCrop(tw,th){
  cropOrigW=canvasW;cropOrigH=canvasH;
  document.getElementById('cropW').value=tw;document.getElementById('cropH').value=th;applyCrop(tw,th);
}
function applyCustomCrop(){
  cropOrigW=canvasW;cropOrigH=canvasH;
  const tw=parseInt(document.getElementById('cropW').value)||240;const th=parseInt(document.getElementById('cropH').value)||240;applyCrop(tw,th);
}
function applyCrop(tw,th){ if(!hasImage)return; pushHistory();
  const scale=Math.min(tw/canvasW,th/canvasH);const sw=Math.round(canvasW*scale);const sh=Math.round(canvasH*scale);
  const t=document.createElement('canvas');t.width=tw;t.height=th;const tc=t.getContext('2d');
  tc.fillStyle='#FFFFFF';tc.fillRect(0,0,tw,th);
  const cur=document.createElement('canvas');cur.width=canvasW;cur.height=canvasH;const cc=cur.getContext('2d');
  cc.drawImage(bgImage,0,0);
  layers.forEach(l=>drawTextOnCtx(cc,l));
  tc.drawImage(cur,0,0,canvasW,canvasH,(tw-sw)/2,(th-sh)/2,sw,sh);
  bgImage=new Image();bgImage.src=t.toDataURL();canvasW=tw;canvasH=th;
  // 缩放图层位置
  const ow=cropOrigW||canvasW,oh=cropOrigH||canvasH;
  layers.forEach(l=>{l.x=Math.round(l.x*(tw/ow));l.y=Math.round(l.y*(th/oh));});
  activeLayerIdx=-1;document.getElementById('textControls').style.display='none';document.getElementById('textNoLayer').style.display='block';
  bgImage.onload=()=>{setupCanvas();render();updateInfo();refreshLayerList();};
  render();updateInfo();
}

function drawTextOnCtx(ctx, l) {
  ctx.save();
  const sw = l.strokeWidth >= 0 ? l.strokeWidth : Math.max(2, l.fontSize*0.08);
  ctx.font = `bold ${l.fontSize}px "${l.fontFamily}",sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.translate(l.x, l.y);
  if (l.rotation) ctx.rotate(l.rotation * Math.PI / 180);
  ctx.strokeStyle = l.strokeColor; ctx.lineWidth = sw; ctx.lineJoin = 'round';
  ctx.strokeText(l.text, 0, 0);
  ctx.fillStyle = l.textColor; ctx.fillText(l.text, 0, 0);
  ctx.restore();
}

// ---- 导出 ----
function exportImage() {
  if (!hasImage) return;
  window.__lt && window.__lt.action('download');
  const format = document.getElementById('exportFormat').value; const ext = format.split('/')[1];
  const out = document.createElement('canvas'); out.width = canvasW; out.height = canvasH;
  const octx = out.getContext('2d');
  octx.drawImage(bgImage, 0, 0);
  layers.forEach(l => drawTextOnCtx(octx, l));
  out.toBlob(blob => {
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'liangtu.' + ext; a.click(); URL.revokeObjectURL(url);
    setTimeout(showFeedbackModal, 500)
  }, format, 0.9);
}

// ---- 信息 ----
function updateInfo() {
  if (!hasImage) { document.getElementById('exportInfo').textContent = '-'; return; }
  mainCanvas.toBlob(blob => {
    document.getElementById('exportInfo').textContent = `${canvasW}×${canvasH}px · ~${Math.round(blob.size/1024)}KB`;
  }, 'image/png');
}

// ---- 清空 ----
function resetAll() {
  bgImage = null; canvasW = 0; canvasH = 0; hasImage = false;
  layers = []; activeLayerIdx = -1;
  history = []; historyIdx = -1; dragging = false;
  frames = []; activeFrameIdx = -1;
  refreshFrameList(); updateGifExportBtn();
  mainCanvas.style.display = 'none'; mainCanvas.style.cursor = 'default';
  canvasArea.classList.add('empty');
  document.getElementById('textInput').value = '';
  document.getElementById('textControls').style.display = 'none';
  document.getElementById('textNoLayer').style.display = 'block';
  document.getElementById('exportInfo').textContent = '-'; fileInput.value = '';
  ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
  refreshLayerList();
}

// ===== 翻转/旋转 =====
function flipH() { if(!hasImage)return;pushHistory();bgImage=transformImage(bgImage,(ctx,w,h)=>{ctx.translate(w,0);ctx.scale(-1,1);});render();}
function flipV() { if(!hasImage)return;pushHistory();bgImage=transformImage(bgImage,(ctx,w,h)=>{ctx.translate(0,h);ctx.scale(1,-1);});render();}
function rotateCW() { if(!hasImage)return;pushHistory();
  bgImage=transformImage(bgImage,(ctx,w,h)=>{ctx.translate(h/2,w/2);ctx.rotate(Math.PI/2);ctx.translate(-w/2,-h/2);});
  const tmp=canvasW;canvasW=canvasH;canvasH=tmp;setupCanvas();render();updateInfo();}
function rotateCCW() { if(!hasImage)return;pushHistory();
  bgImage=transformImage(bgImage,(ctx,w,h)=>{ctx.translate(h/2,w/2);ctx.rotate(-Math.PI/2);ctx.translate(-w/2,-h/2);});
  const tmp=canvasW;canvasW=canvasH;canvasH=tmp;setupCanvas();render();updateInfo();}
function transformImage(img,fn){const w=canvasW,h=canvasH;const t=document.createElement('canvas');t.width=w;t.height=h;
  const tc=t.getContext('2d');tc.save();fn(tc,w,h);tc.drawImage(img,0,0);tc.restore();
  const ni=new Image();ni.src=t.toDataURL();return ni;}

// ===== 滤镜 =====
let currentFilter='none',currentBlur=0;
function applyFilter(type){if(!hasImage)return;pushHistory();currentFilter=type;
  document.getElementById('blurVal').textContent='0px';document.querySelector('#panelFilter input[type=range]').value=0;currentBlur=0;applyAllFilters();}
function applyBlur(val){if(!hasImage)return;pushHistory();currentBlur=parseFloat(val);applyAllFilters();}
function applyAllFilters(){if(!hasImage)return;const t=document.createElement('canvas');t.width=canvasW;t.height=canvasH;const tc=t.getContext('2d');
  let fs='';if(currentBlur>0)fs+=`blur(${currentBlur}px) `;
  if(currentFilter==='grayscale')fs+='grayscale(1)';else if(currentFilter==='sepia')fs+='sepia(1)';else if(currentFilter==='invert')fs+='invert(1)';
  if(fs)tc.filter=fs.trim();tc.drawImage(bgImage,0,0);bgImage=new Image();bgImage.src=t.toDataURL();bgImage.onload=()=>render();render();}

// ===== 调整 =====
function adjustBrightness(){if(hasImage)liveAdjust();}
function adjustContrast(){if(hasImage)liveAdjust();}
function adjustSaturation(){if(hasImage)liveAdjust();}
function liveAdjust(){const b=parseInt(document.getElementById('brightSlider').value);
  const c=parseInt(document.getElementById('contrastSlider').value);const s=parseInt(document.getElementById('saturateSlider').value);
  const fs=`brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
  ctx.clearRect(0,0,canvasW,canvasH);ctx.filter=fs;ctx.drawImage(bgImage,0,0);ctx.filter='none';
  layers.forEach((l,i)=>drawTextLayer(l,i===activeLayerIdx));
  if(watermarkObj&&watermarkObj.text)drawWatermarkLayer(ctx,watermarkObj);}
function resetAdjust(){if(!hasImage)return;pushHistory();
  document.getElementById('brightSlider').value=100;document.getElementById('contrastSlider').value=100;document.getElementById('saturateSlider').value=100;
  document.getElementById('brightVal').textContent='100%';document.getElementById('contrastVal').textContent='100%';document.getElementById('saturateVal').textContent='100%';
  const t=document.createElement('canvas');t.width=canvasW;t.height=canvasH;const tc=t.getContext('2d');
  tc.filter='brightness(100%) contrast(100%) saturate(100%)';tc.drawImage(bgImage,0,0);
  bgImage=new Image();bgImage.src=t.toDataURL();bgImage.onload=()=>render();render();}

// ===== 水印 =====
function drawWatermarkLayer(ctx,wm){if(!wm||!wm.text)return;ctx.save();ctx.globalAlpha=wm.opacity/100;
  ctx.font=`bold ${Math.max(12,Math.round(canvasW/30))}px "Microsoft YaHei",sans-serif`;
  ctx.fillStyle='#ffffff';ctx.strokeStyle='rgba(0,0,0,0.5)';ctx.lineWidth=2;ctx.textAlign='center';ctx.textBaseline='middle';
  const tw=ctx.measureText(wm.text).width;const th=Math.round(canvasW/30);const pad=20;
  if(wm.pos==='tile'){ctx.textAlign='left';const sx=tw+80,sy=th+60;
    for(let y=sy/2;y<canvasH;y+=sy)for(let x=-sx/4;x<canvasW+sx;x+=sx){ctx.strokeText(wm.text,x,y);ctx.fillText(wm.text,x,y);}}
  else{let x,y;if(wm.pos==='br'){x=canvasW-tw/2-pad;y=canvasH-th/2-pad;}else if(wm.pos==='bl'){x=tw/2+pad;y=canvasH-th/2-pad;}else{x=canvasW/2;y=canvasH/2;}
    ctx.textAlign='center';ctx.strokeText(wm.text,x,y);ctx.fillText(wm.text,x,y);}ctx.restore();}
function previewWatermark(){const txt=document.getElementById('watermarkText').value.trim();
  const pos=document.getElementById('watermarkPos').value;const op=parseInt(document.getElementById('wmOpacity').value);
  watermarkObj=txt?{text:txt,pos,opacity:op}:null;if(hasImage)render();}
function applyWatermark(){if(!hasImage||!watermarkObj||!watermarkObj.text)return;pushHistory();
  const t=document.createElement('canvas');t.width=canvasW;t.height=canvasH;const tc=t.getContext('2d');
  tc.drawImage(bgImage,0,0);drawWatermarkLayer(tc,watermarkObj);
  bgImage=new Image();bgImage.src=t.toDataURL();watermarkObj=null;document.getElementById('watermarkText').value='';
  bgImage.onload=()=>render();render();}
function removeWatermark(){watermarkObj=null;document.getElementById('watermarkText').value='';if(hasImage)render();}

// ===== 微信表情导出 =====
function exportForWechat() {
  if (!hasImage) return
  window.__lt && window.__lt.action('download')

  // 合成完整内容到临时 canvas（原始尺寸）
  const full = document.createElement('canvas')
  full.width = canvasW; full.height = canvasH
  const fctx = full.getContext('2d')
  fctx.drawImage(bgImage, 0, 0)
  layers.forEach(l => drawTextOnCtx(fctx, l))

  const sizes = [
    { w: 240, h: 240, name: '240' },
    { w: 120, h: 120, name: '120' },
    { w: 50, h: 50, name: '50' },
    { w: 750, h: 400, name: '750x400' }
  ]
  let doneCount = 0
  const total = sizes.length

  sizes.forEach(({ w, h, name }) => {
    // 缩放到目标尺寸
    const scaled = document.createElement('canvas')
    scaled.width = w; scaled.height = h
    const sctx = scaled.getContext('2d')
    const scale = Math.min(w / canvasW, h / canvasH)
    const sw = Math.round(canvasW * scale), sh = Math.round(canvasH * scale)
    const ox = Math.round((w - sw) / 2), oy = Math.round((h - sh) / 2)
    sctx.drawImage(full, 0, 0, canvasW, canvasH, ox, oy, sw, sh)

    // 输出 canvas：阴影 → 白边 → 原图
    const out = document.createElement('canvas')
    out.width = w; out.height = h
    const octx = out.getContext('2d')

    // 阴影：偏移 + 模糊 + 半透明
    octx.save()
    octx.filter = 'blur(2px)'
    octx.globalAlpha = 0.3
    octx.translate(3, 3)
    octx.drawImage(scaled, 0, 0)
    octx.restore()

    // 白边描边：内容偏移 8 方向画满 2px，再填白
    const strokeR = 2
    for (let dx = -strokeR; dx <= strokeR; dx++) {
      for (let dy = -strokeR; dy <= strokeR; dy++) {
        if (dx === 0 && dy === 0) continue
        octx.drawImage(scaled, dx, dy)
      }
    }
    octx.globalCompositeOperation = 'source-in'
    octx.fillStyle = '#FFFFFF'
    octx.fillRect(0, 0, w, h)
    octx.globalCompositeOperation = 'source-over'

    // 原图盖在最上
    octx.drawImage(scaled, 0, 0)

    // 导出 PNG，强制 ≤100KB
    ;(function tryExport(quality) {
      out.toBlob(blob => {
        const kb = Math.round(blob.size / 1024)
        if (kb <= 100 || quality <= 30) {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = 'liangtu_' + name + '.png'
          a.click(); URL.revokeObjectURL(url)
          doneCount++
          if (doneCount === total) {
            document.getElementById('exportInfo').textContent =
              '240+120+50+750×400 已导出 ✅'
            setTimeout(showFeedbackModal, 500)
          }
        } else {
          tryExport(quality - 15)
        }
      }, 'image/png', quality / 100)
    })(92)
  })
}

// ===== 压缩 =====
function compressExport(){if(!hasImage)return;const q=parseInt(document.getElementById('qualitySlider').value)/100;
  const out=document.createElement('canvas');out.width=canvasW;out.height=canvasH;const octx=out.getContext('2d');
  octx.drawImage(bgImage,0,0);layers.forEach(l=>drawTextOnCtx(octx,l));
  out.toBlob(ob=>{const okb=Math.round(ob.size/1024);
    out.toBlob(cb=>{const ckb=Math.round(cb.size/1024);
      document.getElementById('compressInfo').textContent=`压缩后:~${ckb}KB(原${okb}KB)·质量${Math.round(q*100)}%`;
      const url=URL.createObjectURL(cb);const a=document.createElement('a');a.href=url;a.download='liangtu_compressed.jpg';a.click();URL.revokeObjectURL(url);
    },'image/jpeg',q);
  },'image/png');}

// ===== 导出后弹窗 =====
function showFeedbackModal() {
  document.getElementById('feedbackModal').classList.add('show')
  document.getElementById('fbMsg').value = ''
  document.getElementById('fbMsg').focus()
}
function closeFeedbackModal() {
  document.getElementById('feedbackModal').classList.remove('show')
}
function submitFeedback() {
  var msg = document.getElementById('fbMsg').value.trim()
  if (!msg) { closeFeedbackModal(); return }
  var btn = event.target
  btn.disabled = true; btn.textContent = '发送中...'
  fetch('../api/post_message.php', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({message: msg})
  }).then(function(r) { return r.json() })
    .then(function(d) { if (d.success) closeFeedbackModal() })
    .catch(function() { closeFeedbackModal() })
    .finally(function() { btn.disabled = false; btn.textContent = '发送留言' })
}

// ===== GIF 多帧模式 =====
let frames = []        // [{bgImage, layers, canvasW, canvasH}]
let activeFrameIdx = -1

function addFrame() {
  if (!hasImage) return
  // 保存当前画面为帧快照
  const snapCanvas = document.createElement('canvas')
  snapCanvas.width = canvasW; snapCanvas.height = canvasH
  const sctx = snapCanvas.getContext('2d')
  sctx.drawImage(bgImage, 0, 0)
  layers.forEach(l => drawTextOnCtx(sctx, l))

  const snapImg = new Image()
  snapImg.src = snapCanvas.toDataURL()

  snapImg.onload = function() {
    frames.push({
      bgImage: snapImg,
      layers: JSON.parse(JSON.stringify(layers)),
      canvasW: canvasW,
      canvasH: canvasH
    })
    activeFrameIdx = frames.length - 1
    refreshFrameList()
    updateGifExportBtn()
    
    // 提示用户
    if (frames.length === 1) {
      document.getElementById('frameList').insertAdjacentHTML('beforeend', 
        '<div class="layer-empty" style="color:#f59e0b;font-size:12px;margin-top:6px" id="frameHint">✅ 第1帧已保存！<br>修改画面后再点「保存这一帧」</div>')
    } else if (frames.length >= 2) {
      const hint = document.getElementById('frameHint')
      if (hint) hint.remove()
      document.getElementById('frameList').insertAdjacentHTML('beforeend',
        '<div class="layer-empty" style="color:#22c55e;font-size:12px;margin-top:6px" id="frameHint">✅ 已保存 '+frames.length+' 帧！<br>可以导出GIF了 →</div>')
    }
  }
}

function switchFrame(idx) {
  if (idx < 0 || idx >= frames.length) return
  activeFrameIdx = idx
  const f = frames[idx]
  // 恢复帧状态
  bgImage = f.bgImage
  canvasW = f.canvasW; canvasH = f.canvasH
  layers = JSON.parse(JSON.stringify(f.layers))
  hasImage = true
  activeLayerIdx = -1
  setupCanvas()
  render()
  updateInfo()
  refreshLayerList()
  refreshFrameList()
  document.getElementById('textControls').style.display = 'none'
  document.getElementById('textNoLayer').style.display = 'block'
  canvasArea.classList.remove('empty')
  mainCanvas.style.display = 'block'
}

function deleteFrame(idx) {
  if (idx < 0 || idx >= frames.length) return
  frames.splice(idx, 1)
  if (frames.length === 0) {
    activeFrameIdx = -1
    resetAll()
  } else if (activeFrameIdx >= frames.length) {
    switchFrame(frames.length - 1)
  } else if (activeFrameIdx === idx) {
    switchFrame(Math.min(idx, frames.length - 1))
  }
  refreshFrameList()
  updateGifExportBtn()
}

function refreshFrameList() {
  const list = document.getElementById('frameList')
  // Remove hint if exists
  const hint = document.getElementById('frameHint')
  if (hint) hint.remove()
  
  if (frames.length === 0) {
    list.innerHTML = '<div class="layer-empty">上传图片编辑后<br>点「保存这一帧」<br>每帧内容不同才有动画效果</div>'
    return
  }
  let html = ''
  frames.forEach((f, i) => {
    const cw = Math.min(56, f.canvasW), ch = Math.min(56, f.canvasH)
    html += '<div class="frame-item' + (i === activeFrameIdx ? ' active' : '') + '" onclick="switchFrame(' + i + ')">'
    html += '<canvas width="' + cw + '" height="' + ch + '" id="frameThumb' + i + '"></canvas>'
    html += '<span class="frame-label">' + (i + 1) + '</span>'
    html += '<button class="frame-del" onclick="event.stopPropagation();deleteFrame(' + i + ')">×</button>'
    html += '</div>'
  })
  list.innerHTML = html
  // 渲染缩略图
  requestAnimationFrame(function() {
    frames.forEach(function(f, i) {
      const c = document.getElementById('frameThumb' + i)
      if (c) {
        const tctx = c.getContext('2d')
        tctx.drawImage(f.bgImage, 0, 0, c.width, c.height)
      }
    })
  })
}

function updateGifExportBtn() {
  const btn = document.getElementById('btnExportGIF')
  btn.style.display = (frames.length >= 2) ? 'block' : 'none'
}

function exportGIF() {
  if (frames.length < 2) return
  window.__lt && window.__lt.action('download')

  const w = frames[0].canvasW, h = frames[0].canvasH
  // 统一所有帧尺寸
  const gif = new GIF({
    workers: 2,
    quality: 10,
    width: w, height: h,
    workerScript: 'gif.worker.js'
  })

  const delay = 500  // 500ms 每帧

  frames.forEach(function(f) {
    const fc = document.createElement('canvas')
    fc.width = w; fc.height = h
    const fctx = fc.getContext('2d')
    fctx.drawImage(f.bgImage, 0, 0, w, h)
    f.layers.forEach(function(l) {
      drawTextOnCtx(fctx, l)
    })
    gif.addFrame(fc, {delay: delay, copy: true})
  })

  gif.on('finished', function(blob) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'liangtu.gif'; a.click()
    URL.revokeObjectURL(url)
    setTimeout(showFeedbackModal, 500)
  })

  gif.render()
}
