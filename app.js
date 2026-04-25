let cvReady = false;
let mode = 'manual'; // 'manual' or 'ai'

const video = document.getElementById('videoElement');
const image = document.getElementById('imageElement');
const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');
const loadingOverlay = document.getElementById('loadingOverlay');

const btnCamera = document.getElementById('btnCamera');
const imageUpload = document.getElementById('imageUpload');
const btnModeManual = document.getElementById('btnModeManual');
const btnModeAI = document.getElementById('btnModeAI');
const instructionText = document.getElementById('instructionText');

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
    mode = 'ai';
    btnModeAI.classList.add('active');
    btnModeManual.classList.remove('active');
    instructionText.innerText = "AI Mode: Automatically detecting frame...";
    runAutoDetection();
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
        drawPaintingFrame(frameCorners);
        
        // Draw corner handles if in manual mode
        if (mode === 'manual') {
            drawHandles(frameCorners);
        }
    }
}

function drawPaintingFrame(corners) {
    ctx.save();
    
    // Draw thick stroke to simulate a frame
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.closePath();

    ctx.lineWidth = 15;
    ctx.strokeStyle = '#d4af37'; // Gold color
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 5;
    ctx.shadowOffsetY = 5;
    ctx.stroke();

    // Inner highlight
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.shadowColor = 'transparent';
    ctx.stroke();
    
    ctx.restore();
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
    if (mode !== 'manual' || !currentSource) return;
    
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
    
    // Blur to reduce noise
    cv.GaussianBlur(src, dst, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    
    // Canny edge detection
    cv.Canny(dst, dst, 50, 150, 3, false);
    
    // Dilate to connect broken edges
    let M = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(dst, dst, M, new cv.Point(-1, -1), 1, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(dst, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let maxArea = 0;
    let bestQuad = null;

    for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);
        if (area > 1000) { // minimum area threshold
            let approx = new cv.Mat();
            let peri = cv.arcLength(cnt, true);
            cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
            
            // Look for a quadrilateral
            if (approx.rows === 4 && area > maxArea) {
                maxArea = area;
                if (bestQuad) bestQuad.delete();
                bestQuad = approx.clone();
            }
            approx.delete();
        }
    }

    if (bestQuad) {
        // Extract corners and sort them to match top-left, top-right, bottom-right, bottom-left
        let points = [];
        for (let i = 0; i < 4; i++) {
            points.push({
                x: bestQuad.data32S[i * 2],
                y: bestQuad.data32S[i * 2 + 1]
            });
        }
        
        // Sort corners (simple heuristic: top-left has min sum, bottom-right has max sum, etc.)
        points.sort((a, b) => (a.y - b.y));
        let top = [points[0], points[1]].sort((a,b) => a.x - b.x);
        let bottom = [points[2], points[3]].sort((a,b) => b.x - a.x); // bottom right then bottom left
        
        frameCorners = [top[0], top[1], bottom[0], bottom[1]];
        instructionText.innerText = "Frame detected! Adjust if needed.";
        bestQuad.delete();
        
        // Switch back to manual mode to let them tweak
        setTimeout(() => {
            btnModeManual.click();
        }, 1000);
    } else {
        instructionText.innerText = "Could not detect frame. Try manual mode.";
        setTimeout(() => {
            btnModeManual.click();
        }, 2000);
    }

    src.delete();
    dst.delete();
    M.delete();
    contours.delete();
    hierarchy.delete();
    
    if (currentSource === 'image') drawFrame();
}
