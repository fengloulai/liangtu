// ===== 靓图 表情包工具箱 - Canvas 引擎 =====

// ---- 状态 ----
let originalImage = null;       // 原始图片 Image 对象
let workingCanvas = null;       // 当前编辑画布（离屏）
let previewCtx = null;          // 预览 canvas 2D context
let currentTool = 'crop';
let hasImage = false;

// 拼贴用的第二张图
let collageImage2 = null;

// 文字/气泡的位置（可拖拽）
let overlayX = 0, overlayY = 0;
let overlayActive = false;

// 滤镜前备份
let preFilterCanvas = null;

// DOM
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const canvasOriginal = document.getElementById('canvasOriginal');
const canvasPreview = document.getElementById('canvasPreview');
const ctxOriginal = canvasOriginal.getContext('2d');
const previewPlaceholder = document.getElementById('previewPlaceholder');
const imageInfo = document.getElementById('imageInfo');
const editLabel = document.getElementById('editLabel');

previewCtx = canvasPreview.getContext('2d');

// ---- 图片加载 ----
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => loadImage(e.target.files[0]));

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadImage(file);
});

function loadImage(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      originalImage = img;
      hasImage = true;
      workingCanvas = imageToCanvas(img);
      preFilterCanvas = null;
      overlayActive = false;
      renderAll();
      updateStatus();
      // 隐藏 placeholder
      document.querySelector('.drop-hint').style.display = 'none';
      previewPlaceholder.style.display = 'none';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function imageToCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

// ---- 渲染 ----
function renderAll() {
  if (!workingCanvas) return;
  // 原图
  const ow = workingCanvas.width, oh = workingCanvas.height;
  canvasOriginal.width = ow; canvasOriginal.height = oh;
  canvasOriginal.style.display = 'block';
  canvasOriginal.style.maxWidth = '100%';
  canvasOriginal.style.maxHeight = '100%';
  ctxOriginal.drawImage(workingCanvas, 0, 0);

  // 预览
  canvasPreview.width = ow; canvasPreview.height = oh;
  canvasPreview.style.display = 'block';
  canvasPreview.style.maxWidth = '100%';
  canvasPreview.style.maxHeight = '100%';
  previewCtx.drawImage(workingCanvas, 0, 0);
}

function updateStatus() {
  if (!workingCanvas) { imageInfo.textContent = ''; return; }
  const w = workingCanvas.width, h = workingCanvas.height;
  imageInfo.textContent = `${w}×${h}px`;
  document.getElementById('statusDims').textContent = `${w}×${h}px`;
  document.getElementById('statusFormat').textContent = 'PNG';
  // Estimate size
  const dataUrl = workingCanvas.toDataURL('image/png');
  const sizeKB = Math.round(dataUrl.length * 3 / 4 / 1024);
  document.getElementById('statusSize').textContent = `~${sizeKB} KB`;
  editLabel.textContent = '';
}

// ---- Tab 切换 ----
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    currentTool = tab.dataset.tool;
    document.getElementById('panel' + capitalize(currentTool)).classList.add('active');
  });
});

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ---- 工具：裁剪 ----
function setCropPreset(w, h) {
  document.getElementById('cropW').value = w;
  document.getElementById('cropH').value = h;
  applyCrop();
}

function applyCrop() {
  if (!workingCanvas) return alert('请先上传图片');
  const tw = parseInt(document.getElementById('cropW').value) || 240;
  const th = parseInt(document.getElementById('cropH').value) || 240;
  const ow = workingCanvas.width, oh = workingCanvas.height;

  // 居中裁剪
  const sx = Math.max(0, (ow - tw) / 2);
  const sy = Math.max(0, (oh - th) / 2);
  const sw = Math.min(tw, ow);
  const sh = Math.min(th, oh);

  const nc = document.createElement('canvas');
  nc.width = tw; nc.height = th;
  const nctx = nc.getContext('2d');
  // 白底
  nctx.fillStyle = '#FFFFFF';
  nctx.fillRect(0, 0, tw, th);
  // 画图
  nctx.drawImage(workingCanvas, sx, sy, sw, sh, (tw-sw)/2, (th-sh)/2, sw, sh);
  workingCanvas = nc;
  preFilterCanvas = null;
  overlayActive = false;
  renderAll();
  updateStatus();
}

// ---- 工具：缩放 ----
function applyResize() {
  if (!workingCanvas) return alert('请先上传图片');
  const tw = parseInt(document.getElementById('cropW').value) || 240;
  const th = parseInt(document.getElementById('cropH').value) || 240;

  const nc = document.createElement('canvas');
  nc.width = tw; nc.height = th;
  const nctx = nc.getContext('2d');
  nctx.drawImage(workingCanvas, 0, 0, tw, th);
  workingCanvas = nc;
  preFilterCanvas = null;
  overlayActive = false;
  renderAll();
  updateStatus();
}

// ---- 工具：白底处理 ----
function applyWhiteBg() {
  if (!workingCanvas) return alert('请先上传图片');
  const w = workingCanvas.width, h = workingCanvas.height;
  const ctx = workingCanvas.getContext('2d');
  const data = ctx.getImageData(0, 0, w, h).data;

  // 检测边缘颜色作为背景色
  let r = 0, g = 0, b = 0, count = 0;
  for (let x = 0; x < w; x++) {
    for (let y of [0, h-1]) { const i = (y*w+x)*4; r+=data[i]; g+=data[i+1]; b+=data[i+2]; count++; }
  }
  for (let y = 0; y < h; y++) {
    for (let x of [0, w-1]) { const i = (y*w+x)*4; r+=data[i]; g+=data[i+1]; b+=data[i+2]; count++; }
  }
  r = Math.round(r/count); g = Math.round(g/count); b = Math.round(b/count);

  // 替换接近背景色的像素为白色
  const imgData = ctx.getImageData(0, 0, w, h);
  const px = imgData.data;
  const threshold = 40;
  for (let i = 0; i < px.length; i += 4) {
    const dr = px[i] - r, dg = px[i+1] - g, db = px[i+2] - b;
    if (Math.sqrt(dr*dr+dg*dg+db*db) < threshold) {
      px[i] = 255; px[i+1] = 255; px[i+2] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  preFilterCanvas = null;
  overlayActive = false;
  renderAll();
  updateStatus();
}

function applyTransparentToWhite() {
  if (!workingCanvas) return alert('请先上传图片');
  const w = workingCanvas.width, h = workingCanvas.height;
  // 直接：白底 canvas → 画原图
  const nc = document.createElement('canvas');
  nc.width = w; nc.height = h;
  const nctx = nc.getContext('2d');
  nctx.fillStyle = '#FFFFFF';
  nctx.fillRect(0, 0, w, h);
  nctx.drawImage(workingCanvas, 0, 0);
  workingCanvas = nc;
  preFilterCanvas = null;
  overlayActive = false;
  renderAll();
  updateStatus();
}

// ---- 工具：文字引擎 ----
const textStyles = {
  'white-black': { fill:'#FFFFFF', stroke:'#000000', strokeWidth:4, font:'bold 48px "PingFang SC","Microsoft YaHei",sans-serif', align:'center', y:'bottom' },
  'yellow-red': { fill:'#FFD700', stroke:'#CC0000', strokeWidth:4, font:'bold 52px "PingFang SC","Microsoft YaHei",sans-serif', align:'center', y:'bottom', rotate:-5 },
  'vertical': { fill:'#FF0000', stroke:'#880000', strokeWidth:3, font:'bold 44px "PingFang SC","Microsoft YaHei",sans-serif', align:'center', y:'center', vertical:true },
  'shadow': { fill:'#FF69B4', stroke:'#FF1493', strokeWidth:2, font:'bold 50px "PingFang SC","Microsoft YaHei",sans-serif', align:'center', y:'bottom', shadow:'#FFB6C1', shadowOffset:6 },
  'small-gray': { fill:'#999999', stroke:'none', strokeWidth:0, font:'28px "PingFang SC","Microsoft YaHei",sans-serif', align:'center', y:'bottom' },
};
let selectedTextStyle = 'white-black';

document.querySelectorAll('#textStyles .style-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#textStyles .style-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedTextStyle = btn.dataset.style;
  });
});

function applyText() {
  if (!workingCanvas) return alert('请先上传图片');
  const text = document.getElementById('textInput').value.trim();
  if (!text) return alert('请输入文字');

  const style = textStyles[selectedTextStyle];
  const w = workingCanvas.width, h = workingCanvas.height;
  const ctx = workingCanvas.getContext('2d');

  ctx.save();
  ctx.font = style.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 位置
  let tx = w / 2, ty;
  if (style.y === 'bottom') ty = h - 60;
  else if (style.y === 'center') ty = h / 2;
  else ty = h - 60;

  if (style.rotate) { ctx.translate(tx, ty); ctx.rotate(style.rotate * Math.PI / 180); tx = 0; ty = 0; }

  if (style.shadow) {
    ctx.fillStyle = style.shadow;
    ctx.fillText(text, tx + style.shadowOffset, ty + style.shadowOffset);
  }

  if (style.stroke && style.stroke !== 'none') {
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.strokeWidth || 3;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, tx, ty);
  }

  ctx.fillStyle = style.fill;
  ctx.fillText(text, tx, ty);
  ctx.restore();

  preFilterCanvas = null;
  overlayActive = false;
  renderAll();
  updateStatus();
}

function clearText() {
  if (!originalImage) return;
  workingCanvas = imageToCanvas(originalImage);
  preFilterCanvas = null;
  overlayActive = false;
  renderAll();
  updateStatus();
}

// ---- 工具：对话气泡 ----
const bubbleStyles = {
  'wechat-green': { bg:'#95EC69', color:'#000', radius:16, tailDir:'right-bottom' },
  'wechat-white': { bg:'#FFFFFF', color:'#000', radius:16, tailDir:'left-bottom' },
  'comic': { bg:'#FFFFFF', color:'#000', radius:20, tailDir:'center-bottom', stroke:'#333', strokeWidth:2 },
  'explosion': { bg:'#FF4444', color:'#FFF', radius:8, tailDir:'center-bottom', jagged:true },
  'thought': { bg:'#FFFFFF', color:'#333', radius:24, tailDir:'thought' },
};
let selectedBubble = 'wechat-green';

document.querySelectorAll('#bubbleStyles .style-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#bubbleStyles .style-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedBubble = btn.dataset.bubble;
  });
});

function applyBubble() {
  if (!workingCanvas) return alert('请先上传图片');
  const text = document.getElementById('bubbleText').value.trim();
  if (!text) return alert('请输入气泡文字');

  const style = bubbleStyles[selectedBubble];
  const pos = document.getElementById('bubblePos').value;
  const w = workingCanvas.width, h = workingCanvas.height;
  const ctx = workingCanvas.getContext('2d');

  // Calculate bubble dimensions
  ctx.font = 'bold 36px "PingFang SC","Microsoft YaHei",sans-serif';
  const metrics = ctx.measureText(text);
  const tw = Math.max(metrics.width + 60, 120);
  const th = 80;
  const pad = 20;

  let bx, by;
  if (pos === 'top') { bx = (w - tw) / 2; by = pad; }
  else { bx = (w - tw) / 2; by = h - th - pad - 40; }

  // Draw bubble
  ctx.save();
  ctx.fillStyle = style.bg;
  ctx.strokeStyle = style.stroke || style.bg;
  ctx.lineWidth = style.strokeWidth || 0;

  // Bubble body
  const r = style.radius || 12;
  drawRoundRect(ctx, bx, by, tw, th, r);
  ctx.fill();
  if (style.stroke) ctx.stroke();

  // Tail
  if (pos === 'top') {
    // For explosion: jagged
    if (style.jagged) {
      drawJaggedTail(ctx, bx + tw/2, by + th, 20, 16);
    } else if (style.tailDir === 'thought') {
      drawThoughtTail(ctx, bx + tw/2, by + th);
    } else {
      ctx.beginPath();
      ctx.moveTo(bx + tw/2 - 10, by + th);
      ctx.lineTo(bx + tw/2, by + th + 16);
      ctx.lineTo(bx + tw/2 + 10, by + th);
      ctx.fill();
    }
  } else {
    if (style.jagged) {
      drawJaggedTailUp(ctx, bx + tw/2, by, 20, 16);
    } else if (style.tailDir === 'thought') {
      drawThoughtTailUp(ctx, bx + tw/2, by);
    } else {
      ctx.beginPath();
      ctx.moveTo(bx + tw/2 - 10, by);
      ctx.lineTo(bx + tw/2, by - 16);
      ctx.lineTo(bx + tw/2 + 10, by);
      ctx.fill();
    }
  }

  // Text
  ctx.font = 'bold 30px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillStyle = style.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + tw/2, by + th/2);
  ctx.restore();

  preFilterCanvas = null;
  overlayActive = false;
  renderAll();
}

function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}

function drawThoughtTail(ctx, cx, top) {
  ctx.fillStyle = '#FFFFFF';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    const r = 6 - i * 1.5;
    ctx.arc(cx, top + 16 + i*16, r, 0, Math.PI*2);
    ctx.fill();
  }
}

function drawThoughtTailUp(ctx, cx, bottom) {
  ctx.fillStyle = '#FFFFFF';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    const r = 6 - i * 1.5;
    ctx.arc(cx, bottom - 16 - i*16, r, 0, Math.PI*2);
    ctx.fill();
  }
}

function drawJaggedTail(ctx, cx, top, w, h) {
  ctx.beginPath();
  ctx.moveTo(cx - w/2, top);
  ctx.lineTo(cx - w/4, top + h/2);
  ctx.lineTo(cx, top + h);
  ctx.lineTo(cx + w/4, top + h/2);
  ctx.lineTo(cx + w/2, top);
  ctx.fill();
}

function drawJaggedTailUp(ctx, cx, bottom, w, h) {
  ctx.beginPath();
  ctx.moveTo(cx - w/2, bottom);
  ctx.lineTo(cx - w/4, bottom - h/2);
  ctx.lineTo(cx, bottom - h);
  ctx.lineTo(cx + w/4, bottom - h/2);
  ctx.lineTo(cx + w/2, bottom);
  ctx.fill();
}

// ---- 工具：表情拼贴 ----
document.getElementById('collageFile2').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById('collageFile2Name').textContent = file.name;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => { collageImage2 = img; };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

let selectedCollage = 'left-right';
document.querySelectorAll('#collageStyles .style-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#collageStyles .style-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedCollage = btn.dataset.collage;
  });
});

function applyCollage() {
  if (!workingCanvas) return alert('请先上传第一张图');
  if (!collageImage2) return alert('请选第二张图');

  const img1 = workingCanvas;
  let w, h, positions;

  switch (selectedCollage) {
    case 'left-right':
      w = img1.width + collageImage2.width;
      h = Math.max(img1.height, collageImage2.height);
      positions = [
        { img: img1, x: 0, y: (h-img1.height)/2, w: img1.width, h: img1.height },
        { img: collageImage2, x: img1.width, y: (h-collageImage2.height)/2, w: collageImage2.width, h: collageImage2.height },
      ];
      break;
    case 'top-bottom':
      w = Math.max(img1.width, collageImage2.width);
      h = img1.height + collageImage2.height;
      positions = [
        { img: img1, x: (w-img1.width)/2, y: 0, w: img1.width, h: img1.height },
        { img: collageImage2, x: (w-collageImage2.width)/2, y: img1.height, w: collageImage2.width, h: collageImage2.height },
      ];
      break;
    case 'grid4':
      w = Math.max(img1.width, collageImage2.width) * 2;
      h = Math.max(img1.height, collageImage2.height) * 2;
      const cw = w/2, ch = h/2;
      positions = [
        { img: img1, x: 0, y: 0, w: cw, h: ch },
        { img: collageImage2, x: cw, y: 0, w: cw, h: ch },
        { img: img1, x: 0, y: ch, w: cw, h: ch },
        { img: collageImage2, x: cw, y: ch, w: cw, h: ch },
      ];
      break;
    case 'corner':
      w = img1.width; h = img1.height;
      const miniW = Math.round(img1.width * 0.3);
      const miniH = Math.round(collageImage2.height * miniW / collageImage2.width);
      positions = [
        { img: img1, x: 0, y: 0, w: img1.width, h: img1.height },
        { img: collageImage2, x: img1.width - miniW - 10, y: img1.height - miniH - 10, w: miniW, h: miniH },
      ];
      break;
  }

  const nc = document.createElement('canvas');
  nc.width = w; nc.height = h;
  const nctx = nc.getContext('2d');
  nctx.fillStyle = '#FFFFFF';
  nctx.fillRect(0, 0, w, h);
  positions.forEach(p => {
    nctx.drawImage(p.img, p.x, p.y, p.w, p.h);
  });

  workingCanvas = nc;
  preFilterCanvas = null;
  overlayActive = false;
  renderAll();
  updateStatus();
}

// ---- 工具：搞怪滤镜 ----
let selectedFilter = 'lineart';
document.querySelectorAll('#filterStyles .style-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#filterStyles .style-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedFilter = btn.dataset.filter;
  });
});

function applyFilter() {
  if (!workingCanvas) return alert('请先上传图片');
  if (!preFilterCanvas) preFilterCanvas = imageToCanvas(workingCanvas);

  const strength = parseInt(document.getElementById('filterStrength').value) / 100;
  const w = workingCanvas.width, h = workingCanvas.height;
  const ctx = workingCanvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  switch (selectedFilter) {
    case 'lineart':
      // Sobel edge detection → invert
      const gray = new Uint8Array(w * h);
      for (let i = 0; i < data.length; i += 4) {
        gray[i/4] = data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114;
      }
      for (let y = 1; y < h-1; y++) {
        for (let x = 1; x < w-1; x++) {
          const idx = y*w+x;
          const gx = -gray[idx-w-1]-2*gray[idx-w]-gray[idx-w+1]+gray[idx+w-1]+2*gray[idx+w]+gray[idx+w+1];
          const gy = -gray[idx-w-1]-2*gray[idx-1]-gray[idx+w-1]+gray[idx-w+1]+2*gray[idx+1]+gray[idx+w+1];
          const mag = Math.min(255, Math.sqrt(gx*gx+gy*gy) * strength * 2);
          const inv = 255 - mag;
          data[idx*4] = data[idx*4+1] = data[idx*4+2] = inv;
        }
      }
      break;
    case 'oldstyle':
      for (let i = 0; i < data.length; i += 4) {
        // Boost saturation
        const r = data[i], g = data[i+1], b = data[i+2];
        const avg = (r+g+b)/3;
        data[i] = Math.min(255, avg + (r-avg) * (1 + strength * 3));
        data[i+1] = Math.min(255, avg + (g-avg) * (1 + strength * 3));
        data[i+2] = Math.min(255, avg + (b-avg) * (1 + strength * 3));
        // Sharpen-ish contrast boost
        data[i] = Math.min(255, data[i] * 1.1);
        data[i+1] = Math.min(255, data[i+1] * 1.1);
        data[i+2] = Math.min(255, data[i+2] * 1.1);
      }
      break;
    case 'pixel':
      const ps = Math.max(2, Math.round(strength * 20));
      for (let y = 0; y < h; y += ps) {
        for (let x = 0; x < w; x += ps) {
          let sr=0, sg=0, sb=0, count=0;
          for (let dy=0; dy<ps && y+dy<h; dy++) {
            for (let dx=0; dx<ps && x+dx<w; dx++) {
              const idx = ((y+dy)*w + x+dx) * 4;
              sr+=data[idx]; sg+=data[idx+1]; sb+=data[idx+2]; count++;
            }
          }
          sr=Math.round(sr/count); sg=Math.round(sg/count); sb=Math.round(sb/count);
          for (let dy=0; dy<ps && y+dy<h; dy++) {
            for (let dx=0; dx<ps && x+dx<w; dx++) {
              const idx = ((y+dy)*w + x+dx) * 4;
              data[idx]=sr; data[idx+1]=sg; data[idx+2]=sb;
            }
          }
        }
      }
      break;
    case 'rough':
      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * strength * 80;
        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise));
        data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise));
      }
      break;
    case 'emboss':
      const embossData = new Uint8ClampedArray(data);
      for (let y = 1; y < h-1; y++) {
        for (let x = 1; x < w-1; x++) {
          const idx = (y*w+x)*4;
          const tl = ((y-1)*w+x-1)*4;
          const br = ((y+1)*w+x+1)*4;
          const v = 128 + (embossData[tl] - embossData[br]) * strength * 2;
          data[idx] = data[idx+1] = data[idx+2] = Math.max(0, Math.min(255, v));
        }
      }
      break;
  }

  ctx.putImageData(imgData, 0, 0);
  renderAll();
  updateStatus();
}

function resetFilter() {
  if (!preFilterCanvas) return;
  workingCanvas = imageToCanvas(preFilterCanvas);
  preFilterCanvas = null;
  renderAll();
  updateStatus();
}

// ---- 工具：格式转换 ----
function applyConvert() {
  if (!workingCanvas) return alert('请先上传图片');
  const format = document.getElementById('convertFormat').value;
  const quality = parseInt(document.getElementById('convertQuality').value) / 100;
  const ext = format.split('/')[1];

  workingCanvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `liangtu.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, format, quality);
}

// ---- 下载 ----
function downloadImage() {
  if (!workingCanvas) return alert('请先上传图片');
  workingCanvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'liangtu.png';
    a.click();
    URL.revokeObjectURL(url);
  });
}

// ---- 重置 ----
function resetAll() {
  originalImage = null;
  workingCanvas = null;
  preFilterCanvas = null;
  collageImage2 = null;
  hasImage = false;
  overlayActive = false;
  canvasOriginal.style.display = 'none';
  canvasPreview.style.display = 'none';
  document.querySelector('.drop-hint').style.display = '';
  previewPlaceholder.style.display = '';
  imageInfo.textContent = '';
  document.getElementById('statusDims').textContent = '- × -';
  document.getElementById('statusFormat').textContent = '-';
  document.getElementById('statusSize').textContent = '-';
  document.getElementById('textInput').value = '';
  document.getElementById('bubbleText').value = '';
  document.getElementById('collageFile2Name').textContent = '';
  fileInput.value = '';
}

// ---- 初始化：选中文字引擎默认风格 ----
document.querySelector('#textStyles .style-btn[data-style="white-black"]').classList.add('selected');
document.querySelector('#bubbleStyles .style-btn[data-bubble="wechat-green"]').classList.add('selected');
