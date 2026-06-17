// ===== 靓图 表情包工具箱 - Canvas 引擎 =====

// ---- 状态 ----
let originalImage = null;       // 原始图片 Image 对象
let workingCanvas = null;       // 当前编辑画布（离屏）
let previewCtx = null;          // 预览 canvas 2D context
let currentTool = 'crop';
let hasImage = false;

// 文字/气泡的位置（可拖拽）
let overlayX = 0, overlayY = 0;
let overlayActive = false;

// 滤镜前备份
let preFilterCanvas = null;

// 历史栈（撤销/重做 — Canvas快照）
let historyStack = [];
let historyIndex = -1;
const MAX_HISTORY = 50;

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
      // 隐藏 placeholder，显示工具栏
      document.querySelector('.drop-hint').style.display = 'none';
      previewPlaceholder.style.display = 'none';
      document.getElementById('floatingToolbar').style.display = 'flex';
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

// ---- 历史栈（撤销/重做） ----
function pushHistory() {
  if (!workingCanvas) return;
  historyStack = historyStack.slice(0, historyIndex + 1);
  const clone = document.createElement('canvas');
  clone.width = workingCanvas.width;
  clone.height = workingCanvas.height;
  clone.getContext('2d').drawImage(workingCanvas, 0, 0);
  historyStack.push(clone);
  if (historyStack.length > MAX_HISTORY) historyStack.shift();
  else historyIndex++;
}

function undo() {
  if (historyIndex < 0) return;
  historyIndex--;
  if (historyIndex < 0) {
    // 回到原始图片
    workingCanvas = imageToCanvas(originalImage);
  } else {
    const src = historyStack[historyIndex];
    workingCanvas = document.createElement('canvas');
    workingCanvas.width = src.width;
    workingCanvas.height = src.height;
    workingCanvas.getContext('2d').drawImage(src, 0, 0);
  }
  preFilterCanvas = null;
  overlayActive = false;
  renderAll();
  updateStatus();
}

function redo() {
  if (historyIndex >= historyStack.length - 1) return;
  historyIndex++;
  const src = historyStack[historyIndex];
  workingCanvas = document.createElement('canvas');
  workingCanvas.width = src.width;
  workingCanvas.height = src.height;
  workingCanvas.getContext('2d').drawImage(src, 0, 0);
  preFilterCanvas = null;
  overlayActive = false;
  renderAll();
  updateStatus();
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

// ---- 浮动工具栏切换 ----
document.querySelectorAll('.ft-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tool = btn.dataset.tool;
    const popup = document.getElementById('popup' + capitalize(tool));
    const isActive = btn.classList.contains('active');

    // Close all
    document.querySelectorAll('.ft-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tool-popup').forEach(p => p.classList.remove('open'));

    if (!isActive) {
      btn.classList.add('active');
      if (popup) popup.classList.add('open');
      currentTool = tool;
    }
  });
});

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ---- 工具：裁剪（等比缩放整图到目标尺寸） ----
function setCropPreset(w, h) {
  document.getElementById('cropW').value = w;
  document.getElementById('cropH').value = h;
  applyCrop();
}

function applyCrop() {
  if (!workingCanvas) return alert('请先上传图片');
  pushHistory();
  const tw = parseInt(document.getElementById('cropW').value) || 240;
  const th = parseInt(document.getElementById('cropH').value) || 240;
  const ow = workingCanvas.width, oh = workingCanvas.height;

  // 等比缩放整图，fit within tw×th
  const scale = Math.min(tw / ow, th / oh);
  const sw = Math.round(ow * scale);
  const sh = Math.round(oh * scale);

  const nc = document.createElement('canvas');
  nc.width = tw; nc.height = th;
  const nctx = nc.getContext('2d');
  // 白底
  nctx.fillStyle = '#FFFFFF';
  nctx.fillRect(0, 0, tw, th);
  // 居中画等比缩放后的图
  nctx.drawImage(workingCanvas, 0, 0, ow, oh, (tw - sw) / 2, (th - sh) / 2, sw, sh);
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
  pushHistory();
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
  pushHistory();
  workingCanvas = imageToCanvas(originalImage);
  preFilterCanvas = null;
  overlayActive = false;
  renderAll();
  updateStatus();
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
  }, 'image/png');
}

// ---- 快捷键 ----
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
});

// ---- 重置 ----
function resetAll() {
  originalImage = null;
  workingCanvas = null;
  preFilterCanvas = null;
  hasImage = false;
  overlayActive = false;
  historyStack = [];
  historyIndex = -1;
  canvasOriginal.style.display = 'none';
  canvasPreview.style.display = 'none';
  document.querySelector('.drop-hint').style.display = '';
  previewPlaceholder.style.display = '';
  document.getElementById('floatingToolbar').style.display = 'none';
  imageInfo.textContent = '';
  document.getElementById('statusDims').textContent = '- × -';
  document.getElementById('statusFormat').textContent = '-';
  document.getElementById('statusSize').textContent = '-';
  document.getElementById('textInput').value = '';
  fileInput.value = '';
}

// ---- 初始化：选中文字引擎默认风格 ----
document.querySelector('#textStyles .style-btn[data-style="white-black"]')?.classList.add('selected');

// ===== 反馈功能 =====
function openFeedback() {
  document.getElementById('feedbackModal').classList.add('show');
  document.getElementById('feedbackText').focus();
}

function closeFeedback(event) {
  if (!event || event.target === document.getElementById('feedbackModal')) {
    document.getElementById('feedbackModal').classList.remove('show');
  }
}

function copyEmail() {
  navigator.clipboard.writeText('599492435@qq.com').then(() => {
    showToast('📋 邮箱已复制！');
  }).catch(() => {
    showToast('复制失败，请手动复制');
  });
}

// 表单提交：关闭弹窗 + 显示成功提示
document.getElementById('feedbackForm').addEventListener('submit', function() {
  setTimeout(function() {
    document.getElementById('feedbackModal').classList.remove('show');
    document.getElementById('feedbackText').value = '';
    showToast('✅ 反馈已发送，感谢你的建议！');
  }, 300);
});

function showToast(msg) {
  var t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function() { t.remove(); }, 2500);
}