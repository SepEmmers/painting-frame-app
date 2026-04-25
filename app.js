let cvReady = false;
let mode = 'manual'; // 'manual', 'ai_select', or 'ai_tracking'
let detectedQuads = []; // Stores arrays of 4 corners
let oldGray = null; // For optical flow
let oldPoints = null; // For optical flow

const video = document.getElementById('videoElement');
const image = document.getElementById('imageElement');
const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');
const loadingOverlay = document.getElementById('loadingOverlay');

const btnCamera = document.getElementById('btnCamera');
const imageUpload = document.getElementById('imageUpload');
const btnCapture = document.getElementById('btnCapture');
const btnModeManual = document.getElementById('btnModeManual');
const btnModeAI = document.getElementById('btnModeAI');
const frameStyleSelect = document.getElementById('frameStyleSelect');
const instructionText = document.getElementById('instructionText');

let currentFrameStyle = 'gold_real';

const imgFrameGold = document.getElementById('imgFrameGold');

let currentSource = null; // 'video' or 'image'
let isStreaming = false;

// Frame state
let frameCorners = [
    {x: 100, y: 100}, // Top-left
    {x: 300, y: 100}, // Top-right
    {x: 300, y: 300}, // Bottom-right
    {x: 100, y: 300}  // Bottom-left
];
let activeCornerIndex = -1;
let isDragging = false;

// Initialize OpenCV
window.onOpenCvReady = function() {
    cvReady = true;
    loadingOverlay.style.display = 'none';
    btnModeAI.disabled = false;
    console.log('OpenCV.js is ready.');
};

if (window.cvIsReady) {
    window.onOpenCvReady();
}

// --- Input Handling ---

btnCamera.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        video.srcObject = stream;
        video.play();
        currentSource = 'video';
        isStreaming = true;
        video.style.display = 'none'; // Keep hidden, draw on canvas
        
        video.addEventListener('canplay', () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            resetCorners(canvas.width, canvas.height);
            requestAnimationFrame(drawLoop);
        }, { once: true });
    } catch (err) {
        alert("Error accessing camera: " + err.message);
    }
});

imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (isStreaming && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        isStreaming = false;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        image.onload = function() {
            currentSource = 'image';
            canvas.width = image.width;
            canvas.height = image.height;
            resetCorners(canvas.width, canvas.height);
            drawFrame();
        }
        image.src = event.target.result;
    }
    reader.readAsDataURL(file);
});

btnCapture.addEventListener('click', () => {
    if (!currentSource) {
        alert("Please start the camera or upload an image first!");
        return;
    }
    
    // Temporarily hide handles before taking screenshot
    const wasManual = (mode === 'manual');
    if (wasManual) {
        mode = 'capturing'; // temp state to skip drawing handles
        drawFrame(); // redraw without handles
    }
    
    // Get image and download
    const dataURL = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'framed_picture.png';
    link.href = dataURL;
    link.click();
    
    // Restore mode
    if (wasManual) {
        mode = 'manual';
        drawFrame();
    }
});

// --- UI Toggles ---

btnModeManual.addEventListener('click', () => {
    mode = 'manual';
    btnModeManual.classList.add('active');
    btnModeAI.classList.remove('active');
    instructionText.innerText = "Drag the corners to fit the frame to your object.";
    if (currentSource === 'image') drawFrame();
});

btnModeAI.addEventListener('click', () => {
    if (!cvReady || !currentSource) return;
    mode = 'ai_select';
    btnModeAI.classList.add('active');
    btnModeManual.classList.remove('active');
    instructionText.innerText = "Scanning... tap a highlighted box to track it.";
    runAutoDetection();
});

frameStyleSelect.addEventListener('change', (e) => {
    currentFrameStyle = e.target.value;
    if (currentSource === 'image') drawFrame();
});

// --- Drawing Logic ---

function resetCorners(w, h) {
    const padding = Math.min(w, h) * 0.2;
    frameCorners = [
        {x: padding, y: padding},
        {x: w - padding, y: padding},
        {x: w - padding, y: h - padding},
        {x: padding, y: h - padding}
    ];
}

function drawLoop() {
    if (currentSource === 'video' && isStreaming) {
        if (mode === 'ai_tracking') {
            updateOpticalFlow();
        }
        drawFrame();
        requestAnimationFrame(drawLoop);
    }
}

function drawFrame() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Source (Video or Image)
    if (currentSource === 'video') {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else if (currentSource === 'image') {
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    }

    // Draw Frame Overlay
    if (currentSource) {
        if (mode === 'ai_select') {
            drawDetectedQuads();
        } else {
            drawPaintingFrame(frameCorners);
            if (mode === 'manual') {
                drawHandles(frameCorners);
            }
        }
    }
}

function drawDetectedQuads() {
    ctx.fillStyle = 'rgba(99, 102, 241, 0.4)'; // Primary color with opacity
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 3;

    detectedQuads.forEach(quad => {
        ctx.beginPath();
        ctx.moveTo(quad[0].x, quad[0].y);
        ctx.lineTo(quad[1].x, quad[1].y);
        ctx.lineTo(quad[2].x, quad[2].y);
        ctx.lineTo(quad[3].x, quad[3].y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    });
}

function drawPaintingFrame(corners) {
    if (currentFrameStyle === 'gold_real' && cvReady) {
        drawWarpedImage(imgFrameGold, corners);
        return;
    }

    ctx.save();
    
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.closePath();

    if (currentFrameStyle === 'gold') {
        ctx.lineWidth = 15;
        ctx.strokeStyle = '#d4af37';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 5;
        ctx.shadowOffsetY = 5;
        ctx.stroke();

        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff';
        ctx.shadowColor = 'transparent';
        ctx.stroke();
    } else if (currentFrameStyle === 'wood') {
        ctx.lineWidth = 25;
        ctx.strokeStyle = '#3e2723';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 8;
        ctx.shadowOffsetY = 8;
        ctx.stroke();

        ctx.lineWidth = 15;
        ctx.strokeStyle = '#4e342e';
        ctx.stroke();
    } else if (currentFrameStyle === 'modern') {
        ctx.lineWidth = 20;
        ctx.strokeStyle = '#111';
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.stroke();
    } else if (currentFrameStyle === 'neon') {
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#fff';
        ctx.shadowColor = '#f0f';
        ctx.shadowBlur = 20;
        ctx.stroke();
        ctx.shadowColor = '#0ff';
        ctx.shadowBlur = 10;
        ctx.stroke();
    }
    
    ctx.restore();
}

function drawWarpedImage(imgElement, dstCorners) {
    if (!imgElement.complete || imgElement.naturalWidth === 0) return;

    let src = cv.imread(imgElement);
    
    let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0,
        imgElement.width, 0,
        imgElement.width, imgElement.height,
        0, imgElement.height
    ]);
    
    let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        dstCorners[0].x, dstCorners[0].y,
        dstCorners[1].x, dstCorners[1].y,
        dstCorners[2].x, dstCorners[2].y,
        dstCorners[3].x, dstCorners[3].y
    ]);

    let M = cv.getPerspectiveTransform(srcTri, dstTri);
    let dst = new cv.Mat();
    let dsize = new cv.Size(canvas.width, canvas.height);
    
    // Warp perspective with transparent background (Scalar 0,0,0,0)
    cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0));
    
    cv.imshow('hiddenCanvas', dst);
    ctx.drawImage(document.getElementById('hiddenCanvas'), 0, 0);

    src.delete(); dst.delete(); M.delete(); srcTri.delete(); dstTri.delete();
}

function drawHandles(corners) {
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    const handleRadius = Math.max(8, canvas.width * 0.015); // Dynamic size based on canvas

    corners.forEach((corner, i) => {
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, handleRadius, 0, 2 * Math.PI);
        if (i === activeCornerIndex) {
            ctx.fillStyle = 'var(--primary-color)';
        } else {
            ctx.fillStyle = 'white';
        }
        ctx.fill();
        ctx.stroke();
    });
}

// --- Interaction Logic ---

function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX = evt.clientX;
    let clientY = evt.clientY;
    
    if (evt.touches && evt.touches.length > 0) {
        clientX = evt.touches[0].clientX;
        clientY = evt.touches[0].clientY;
    }

    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

function handlePointerDown(e) {
    if (!currentSource) return;
    const pos = getMousePos(e);

    if (mode === 'ai_select') {
        // Check if click is inside a detected quad (simple bounding box check or polygon test)
        // A simple way is to use Canvas API isPointInPath
        for (let i = 0; i < detectedQuads.length; i++) {
            let quad = detectedQuads[i];
            ctx.beginPath();
            ctx.moveTo(quad[0].x, quad[0].y);
            ctx.lineTo(quad[1].x, quad[1].y);
            ctx.lineTo(quad[2].x, quad[2].y);
            ctx.lineTo(quad[3].x, quad[3].y);
            ctx.closePath();
            
            if (ctx.isPointInPath(pos.x, pos.y)) {
                frameCorners = quad;
                startTracking();
                break;
            }
        }
        return;
    }

    if (mode !== 'manual') return;
    
    const pos = getMousePos(e);
    const handleRadius = Math.max(15, canvas.width * 0.03); // Larger hit area
    
    activeCornerIndex = -1;
    for (let i = 0; i < frameCorners.length; i++) {
        const dx = pos.x - frameCorners[i].x;
        const dy = pos.y - frameCorners[i].y;
        if (dx * dx + dy * dy < handleRadius * handleRadius) {
            activeCornerIndex = i;
            isDragging = true;
            break;
        }
    }
    
    if (currentSource === 'image') drawFrame();
}

function handlePointerMove(e) {
    if (!isDragging || activeCornerIndex === -1) return;
    e.preventDefault(); // Prevent scrolling on touch
    
    const pos = getMousePos(e);
    frameCorners[activeCornerIndex].x = pos.x;
    frameCorners[activeCornerIndex].y = pos.y;
    
    if (currentSource === 'image') drawFrame();
}

function handlePointerUp() {
    isDragging = false;
    activeCornerIndex = -1;
    if (currentSource === 'image') drawFrame();
}

canvas.addEventListener('mousedown', handlePointerDown);
canvas.addEventListener('mousemove', handlePointerMove);
window.addEventListener('mouseup', handlePointerUp);

canvas.addEventListener('touchstart', handlePointerDown, {passive: false});
canvas.addEventListener('touchmove', handlePointerMove, {passive: false});
window.addEventListener('touchend', handlePointerUp);


// --- OpenCV AI Detection Logic ---

function runAutoDetection() {
    if (!cvReady || !currentSource) return;

    let src;
    if (currentSource === 'video') {
        src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
        let cap = new cv.VideoCapture(video);
        cap.read(src);
    } else {
        src = cv.imread(image);
    }

    let dst = new cv.Mat();
    cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY, 0);
    cv.GaussianBlur(src, dst, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(dst, dst, 50, 150, 3, false);
    
    let M = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(dst, dst, M, new cv.Point(-1, -1), 1, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(dst, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    detectedQuads = [];

    for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);
        if (area > 2000) { // minimum area threshold
            let approx = new cv.Mat();
            let peri = cv.arcLength(cnt, true);
            cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
            
            if (approx.rows === 4) {
                let points = [];
                for (let j = 0; j < 4; j++) {
                    points.push({
                        x: approx.data32S[j * 2],
                        y: approx.data32S[j * 2 + 1]
                    });
                }
                
                // Sort corners: top-left, top-right, bottom-right, bottom-left
                points.sort((a, b) => (a.y - b.y));
                let top = [points[0], points[1]].sort((a,b) => a.x - b.x);
                let bottom = [points[2], points[3]].sort((a,b) => b.x - a.x);
                
                detectedQuads.push([top[0], top[1], bottom[0], bottom[1]]);
            }
            approx.delete();
        }
    }

    if (detectedQuads.length > 0) {
        instructionText.innerText = `Found ${detectedQuads.length} frame(s). Tap one to select.`;
    } else {
        instructionText.innerText = "No frames found. Try manual mode or adjust camera.";
        setTimeout(() => {
            btnModeManual.click();
        }, 3000);
    }

    src.delete();
    dst.delete();
    M.delete();
    contours.delete();
    hierarchy.delete();
    
    if (currentSource === 'image') drawFrame();
}

function startTracking() {
    if (!cvReady || currentSource !== 'video') {
        mode = 'manual';
        btnModeManual.click();
        return;
    }
    
    mode = 'ai_tracking';
    instructionText.innerText = "Tracking active! AR Mode.";
    
    if (oldGray) oldGray.delete();
    if (oldPoints) oldPoints.delete();

    let src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
    let cap = new cv.VideoCapture(video);
    cap.read(src);

    oldGray = new cv.Mat();
    cv.cvtColor(src, oldGray, cv.COLOR_RGBA2GRAY);

    let pts = new Float32Array(8);
    for (let i = 0; i < 4; i++) {
        pts[i * 2] = frameCorners[i].x;
        pts[i * 2 + 1] = frameCorners[i].y;
    }
    oldPoints = cv.matFromArray(4, 1, cv.CV_32FC2, pts);
    src.delete();
}

function updateOpticalFlow() {
    if (!cvReady || !oldGray || !oldPoints) return;

    let src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
    let cap = new cv.VideoCapture(video);
    cap.read(src);

    let frameGray = new cv.Mat();
    cv.cvtColor(src, frameGray, cv.COLOR_RGBA2GRAY);

    let newPoints = new cv.Mat();
    let status = new cv.Mat();
    let err = new cv.Mat();
    let winSize = new cv.Size(21, 21);
    let maxLevel = 2;
    let criteria = new cv.TermCriteria(cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT, 10, 0.03);

    cv.calcOpticalFlowPyrLK(oldGray, frameGray, oldPoints, newPoints, status, err, winSize, maxLevel, criteria);

    // Check if points are found
    let goodPoints = [];
    for (let i = 0; i < status.rows; i++) {
        if (status.data[i] === 1) {
            goodPoints.push({
                x: newPoints.data32F[i * 2],
                y: newPoints.data32F[i * 2 + 1]
            });
        }
    }

    if (goodPoints.length === 4) {
        frameCorners = goodPoints;
        // Update history
        oldGray.delete();
        oldPoints.delete();
        oldGray = frameGray.clone();
        oldPoints = newPoints.clone();
    } else {
        // Tracking lost, fallback to manual or pause
        instructionText.innerText = "Tracking lost! Switching to manual.";
        mode = 'manual';
        btnModeManual.classList.add('active');
        btnModeAI.classList.remove('active');
    }

    src.delete();
    frameGray.delete();
    newPoints.delete();
    status.delete();
    err.delete();
}
