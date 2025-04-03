// Apply transform based on current scale and position
function applyTransform() {
    renderContainer.style.transform = `translate(${moveX}px, ${moveY}px) scale(${renderContainer.currentScale})`;
    updateClickableAreas();
}

// Zoom in
document.getElementById('zoom-in').addEventListener('click', function() {
    renderContainer.currentScale *= 1.25;
    document.getElementById('zoom-level').textContent = `${Math.round(renderContainer.currentScale * 100)}%`;
    applyTransform();
});

// Zoom out
document.getElementById('zoom-out').addEventListener('click', function() {
    renderContainer.currentScale /= 1.25;
    document.getElementById('zoom-level').textContent = `${Math.round(renderContainer.currentScale * 100)}%`;
    applyTransform();
});

// Reset view
document.getElementById('reset-view').addEventListener('click', function() {
    renderContainer.currentScale = baseScale;
    moveX = 0;
    moveY = 0;
    renderContainer.lastMoveX = 0;
    renderContainer.lastMoveY = 0;
    document.getElementById('zoom-level').textContent = '100%';
    applyTransform();
});

// Mouse events for panning
pdfContainer.addEventListener('mousedown', function(e) {
    moveX = 0;
    moveY = 0;    
    startX = e.clientX;
    startY = e.clientY;
    if (e.target.parentElement.parentElement.id == 'clickable-areas-container'){
        isDragging = e.target.parentElement;
        console.log(isDragging.lastMoveY);
        isDragging.lastMoveY = 0;
        isDragging.lastMoveX = 0;
        isDragging.scale = canvas.width/canvas.getBoundingClientRect().width;
        isDragging.currentScale = 1;
        isDragging.target = e.target;
        if (e.target === e.target.parentElement.gElement){
            isDragging.style.cursor = 'grabbing';
            return
        }
        if (e.target === isDragging.nsElement || e.target === isDragging.seElement){
            isDragging.lastMoveY = parseFloat(isDragging.style.height);
        }
        if (e.target === isDragging.ewElement || e.target === isDragging.seElement){
            isDragging.lastMoveX = parseFloat(isDragging.style.width);
        }
        return;
    }
    if (!(e.target === pdfContainer || e.target === canvas || e.target === renderContainer)) {return;}
    isDragging = renderContainer;
    isDragging.target = e.target;
    isDragging.scale = 1;
    pdfContainer.style.cursor = 'grabbing';
    
});

document.addEventListener('mousemove', function(e) { 
    const rect = canvas.getBoundingClientRect();
    const pdfX = Math.round((e.clientX - rect.left - moveX) / renderContainer.currentScale);
    const pdfY = Math.round((e.clientY - rect.top - moveY) / renderContainer.currentScale);
    document.getElementById('coord').innerText = `Coords: ${pdfX} x ${pdfY} y`;
    // if Dragging is Set
    if (!isDragging) return;
    moveX = isDragging.lastMoveX + (isDragging.scale * (e.clientX - startX));
    moveY = isDragging.lastMoveY + (isDragging.scale * (e.clientY - startY));
    if (isDragging.nsElement === isDragging.target || isDragging.ewElement === isDragging.target || isDragging.seElement == isDragging.target){
        if (isDragging.ewElement !== isDragging.target) {
            if (moveY < 0) { moveY = 0 };
            isDragging.style.height = `${moveY}px`;
        }
        if (isDragging.nsElement !== isDragging.target) {
            if (moveX < 0) { moveX = 0 };
            isDragging.style.width = `${moveX}px`;
        }
        return
    }
    isDragging.style.transform = `translate(${moveX}px, ${moveY}px) scale(${isDragging.currentScale})`;
});

document.addEventListener('mouseup', function() {
    if (isDragging) {
        if (isDragging.parentElement.id == "clickable-areas-container"){
            isDragging.lastMoveX = 0;
            isDragging.lastMoveY = 0;
            isDragging.style.transform = '';
            if (isDragging.gElement == isDragging.target){
                isDragging.object.x += moveX;
                isDragging.object.y += moveY;
            } else {
                isDragging.object.width = parseFloat(isDragging.style.width);
                isDragging.object.height = parseFloat(isDragging.style.height);
            }
            updateClickableArea(isDragging.object)
        } else {
            isDragging.lastMoveX = moveX;
            isDragging.lastMoveY = moveY;
        }
        isDragging = null;
        pdfContainer.style.cursor = 'grab';
    }
});

// Touch events for mobile panning
pdfContainer.addEventListener('touchstart', function(e) {
    console.log("oh");
    if (e.touches.length === 1) {
        // Only start dragging if not touching a clickable area
        if (e.target === pdfContainer || e.target === canvas || e.target === renderContainer) {
            isDragging = true;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        }
    }
});

pdfContainer.addEventListener('touchmove', function(e) {
    if (!isDragging || e.touches.length !== 1) return;
    
    moveX = renderContainer.lastMoveX + (e.touches[0].clientX - startX);
    moveY = renderContainer.lastMoveY + (e.touches[0].clientY - startY);
    
    renderContainer.style.transform = `translate(${moveX}px, ${moveY}px) scale(${renderContainer.currentScale})`;
    e.preventDefault();
});

pdfContainer.addEventListener('touchend', function(e) {
    if (isDragging) {
        isDragging = false;
        renderContainer.lastMoveX = moveX;
        renderContainer.lastMoveY = moveY;
    }
});

// Mouse wheel for zooming
pdfContainer.addEventListener('wheel', function(e) {
    e.preventDefault();
    
    // Check if zooming in or out based on wheel direction
    if (e.deltaY < 0) {
        // Zoom in
        renderContainer.currentScale *= 1.1;
    } else {
        // Zoom out
        renderContainer.currentScale /= 1.1;
    }
    
    // Update display and apply transform
    document.getElementById('zoom-level').textContent = `${Math.round(renderContainer.currentScale * 100)}%`;
    applyTransform();
});

// Pinch to zoom (basic implementation)
let initialDistance = 0;
let initialScale = 0;

pdfContainer.addEventListener('touchstart', function(e) {
    if (e.touches.length === 2) {
        // Calculate initial distance between two fingers
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialDistance = Math.sqrt(dx * dx + dy * dy);
        initialScale = renderContainer.currentScale;
        isDragging = false;
    }
});

pdfContainer.addEventListener('touchmove', function(e) {
    if (e.touches.length === 2) {
        // Calculate new distance
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const newDistance = Math.sqrt(dx * dx + dy * dy);
        
        // Calculate scale factor
        renderContainer.currentScale = initialScale * (newDistance / initialDistance);
        
        // Update display
        document.getElementById('zoom-level').textContent = `${Math.round(renderContainer.currentScale * 100)}%`;
        applyTransform();
        
        e.preventDefault();
    }
});

pdfContainer.addEventListener('touchend', function(e) {
    if (e.touches.length < 2 && initialDistance !== 0) {
        initialDistance = 0;
    }
});

// Initial setup
pdfContainer.style.cursor = 'grab';