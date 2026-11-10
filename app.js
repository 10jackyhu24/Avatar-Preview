try {
  document.documentElement.dataset.theme = localStorage.getItem('avatar-theme') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
} catch { document.documentElement.dataset.theme = 'light'; }

document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  let image = null;
  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;
  let shape = 'circle';
  let dragging = null;
  let displayScale = 1;
  let loadId = 0;
  let downloadName = 'avatar';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function updateTheme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    $('theme').textContent = dark ? '☀' : '☾';
    $('theme').title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    $('theme').setAttribute('aria-label', $('theme').title);
  }
  $('theme').onclick = () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('avatar-theme', theme); } catch { /* Storage is optional. */ }
    updateTheme();
  };
  updateTheme();

  // Offsets are in source-image pixels, so resizing the page preserves the crop.
  function crop() {
    const side = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
    const maxX = (image.naturalWidth - side) / 2;
    const maxY = (image.naturalHeight - side) / 2;
    offsetX = clamp(offsetX, -maxX, maxX);
    offsetY = clamp(offsetY, -maxY, maxY);
    return { x: maxX - offsetX, y: maxY - offsetY, side };
  }

  function render() {
    const width = $('stage').clientWidth;
    const height = $('stage').clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!image) return;
    const rect = crop();
    const side = Math.min(width - 56, height - 56);
    const left = (width - side) / 2;
    const top = (height - side) / 2;
    displayScale = side / rect.side;
    const imageWidth = image.naturalWidth * displayScale;
    const imageHeight = image.naturalHeight * displayScale;
    ctx.drawImage(image,
      (width - imageWidth) / 2 + offsetX * displayScale,
      (height - imageHeight) / 2 + offsetY * displayScale,
      imageWidth, imageHeight);

    function framePath() {
      if (shape === 'circle') {
        ctx.moveTo(left + side, height / 2);
        ctx.arc(width / 2, height / 2, side / 2, 0, Math.PI * 2);
      } else ctx.rect(left, top, side, side);
    }
    // Cropped-out areas are either translucent or fully black.
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    framePath();
    ctx.fillStyle = $('mask').checked ? 'rgba(0, 0, 0, 0.55)' : '#000';
    ctx.fill('evenodd');
    ctx.beginPath();
    framePath();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  new ResizeObserver(render).observe($('stage'));

  function setZoom(value) {
    zoom = clamp(value, 1, 3);
    $('zoom').value = Math.round(zoom * 100);
    $('zoom-value').value = `${Math.round(zoom * 100)}%`;
    render();
  }
  $('zoom').oninput = () => setZoom(Number($('zoom').value) / 100);
  $('mask').onchange = render;
  $('shape').onclick = () => {
    shape = shape === 'circle' ? 'square' : 'circle';
    $('shape-name').textContent = shape === 'circle' ? 'Circle' : 'Square';
    $('shape').setAttribute('aria-pressed', String(shape === 'square'));
    $('shape').title = shape === 'circle' ? 'Switch to square preview' : 'Switch to circle preview';
    render();
  };
  $('reset').onclick = () => { offsetX = 0; offsetY = 0; setZoom(1); };

  canvas.onpointerdown = event => {
    if (!image || dragging || (event.pointerType === 'mouse' && event.button !== 0)) return;
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, offsetX, offsetY };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('dragging');
  };
  canvas.onpointermove = event => {
    if (!dragging || event.pointerId !== dragging.id) return;
    offsetX = dragging.offsetX + (event.clientX - dragging.x) / displayScale;
    offsetY = dragging.offsetY + (event.clientY - dragging.y) / displayScale;
    render();
  };
  function stopDrag(event) {
    if (dragging && event.pointerId === dragging.id) {
      dragging = null;
      canvas.classList.remove('dragging');
    }
  }
  canvas.onpointerup = canvas.onpointercancel = canvas.onlostpointercapture = stopDrag;
  canvas.addEventListener('wheel', event => {
    if (!image) return;
    event.preventDefault();
    setZoom(zoom + (event.deltaY < 0 ? .05 : -.05));
  }, { passive: false });
  canvas.onkeydown = event => {
    if (!image) return;
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!directions[event.key]) return;
    event.preventDefault();
    const [x, y] = directions[event.key];
    const step = (event.shiftKey ? 20 : 4) / displayScale;
    offsetX += x * step; offsetY += y * step;
    render();
  };

  function openFile(file) {
    if (!file) return;
    $('message').textContent = '';
    if (!/^image\/(png|jpeg|webp|avif|gif|bmp|x-ms-bmp)$/i.test(file.type) &&
        !(file.type === '' && /\.(png|jpe?g|webp|avif|gif|bmp)$/i.test(file.name))) {
      $('message').textContent = 'Please choose a JPG, PNG, WebP, AVIF, GIF, or BMP image.';
      return;
    }
    const thisLoad = ++loadId;
    const url = URL.createObjectURL(file);
    const nextImage = new Image();
    nextImage.onload = () => {
      URL.revokeObjectURL(url);
      if (thisLoad !== loadId) return;
      image = nextImage;
      dragging = null;
      canvas.classList.remove('dragging');
      offsetX = offsetY = 0;
      downloadName = file.name.replace(/\.[^.]+$/, '') || 'avatar';
      $('filename').textContent = file.name;
      $('filename').title = file.name;
      $('empty').hidden = true;
      $('controls').disabled = false;
      setZoom(1);
    };
    nextImage.onerror = () => {
      URL.revokeObjectURL(url);
      if (thisLoad === loadId) $('message').textContent = 'This image could not be opened. Please try another file.';
    };
    nextImage.src = url;
  }
  $('upload').onclick = $('empty').onclick = () => $('file').click();
  $('file').onchange = () => { openFile($('file').files[0]); $('file').value = ''; };
  document.addEventListener('dragover', event => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    $('stage').classList.add('dragover');
  });
  document.addEventListener('dragleave', event => {
    if (!event.relatedTarget) $('stage').classList.remove('dragover');
  });
  document.addEventListener('drop', event => {
    event.preventDefault();
    $('stage').classList.remove('dragover');
    openFile(event.dataTransfer.files[0]);
  });

  $('download').onclick = () => {
    if (!image) return;
    const rect = crop();
    const output = document.createElement('canvas');
    output.width = output.height = Math.max(1, Math.min(1024, Math.round(rect.side)));
    const outputContext = output.getContext('2d');
    outputContext.imageSmoothingQuality = 'high';
    // Export the source square directly: no mask, outline, or circular clipping.
    outputContext.drawImage(image, rect.x, rect.y, rect.side, rect.side, 0, 0, output.width, output.height);
    try {
      output.toBlob(blob => {
        if (!blob) { $('message').textContent = 'Could not save the image. Please try again.'; return; }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${downloadName}-avatar.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }, 'image/png');
    } catch { $('message').textContent = 'Could not save the image. Please try another file.'; }
  };
});
