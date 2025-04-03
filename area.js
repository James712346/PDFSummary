// Execute action for clickable area
function executeAction(actionRoom, areaIndex) {
    const actionPanel = document.getElementById('action-panel');
    const actionResult = document.getElementById('action-result');

    try {

        OpenRoomInformation(actionRoom);
        // Show success message in action panel
        actionResult.textContent = `Action from Room ${actionRoom} executed successfully.`;
    } catch (error) {
        // Show error message in action panel
        actionResult.textContent = `Error executing action: ${error.message}`;
        console.error('Error executing action:', error);
    }

    // Display the action panel
    actionPanel.style.display = 'block';

    // Hide after a few seconds
    setTimeout(() => {
        actionPanel.style.display = 'none';
    }, 3000);
}

// Update clickable areas
function updateClickableAreas() {
    // Clear existing areas
    clickableAreasContainer.innerHTML = '';
    
    // Create element for each clickable area
    clickableAreas.forEach((area, index) => {
        if (area.scale != baseScale){
            var factor = baseScale / area.scale;
            area.x = factor * area.x;
            area.y = factor * area.y;
            area.width = factor * area.width;
            area.height = factor * area.height;
            area.scale = baseScale;
        }
        const areaElement = document.createElement('div');
        areaElement.id = area.id;
        areaElement.className = 'clickable-area';
        areaElement.style.left = `${area.x}px`;
        areaElement.style.top = `${area.y}px`;
        areaElement.style.width = `${area.width}px`;
        areaElement.style.height = `${area.height}px`;
        areaElement.title = area.label;
        areaElement.style.display = areaVisibility ? 'grid' : 'none';
        areaElement.style['grid-template-columns'] = '80% 20%';
        areaElement.style['grid-template-rows'] = '80% 20%';
        areaElement.lastMoveY = 0;
        areaElement.lastMoveX = 0;
        areaElement.object = area;
        if (resizemoveflag){
            areaElement.gElement = document.createElement("div");
            areaElement.gElement.style.cursor = 'grab';
            areaElement.ewElement = document.createElement("div");
            areaElement.ewElement.style.cursor = 'ew-resize';
            areaElement.nsElement = document.createElement("div");
            areaElement.nsElement.style.cursor = 'ns-resize';
            areaElement.seElement = document.createElement("div");
            areaElement.seElement.style.cursor = 'se-resize';
            areaElement.appendChild(areaElement.gElement);
            areaElement.appendChild(areaElement.ewElement);
            areaElement.appendChild(areaElement.nsElement);
            areaElement.appendChild(areaElement.seElement);
        } else {
            //Event listener for the clickable area
            areaElement.addEventListener('click', function(e) {
                e.stopPropagation();
                executeAction(area.room, index);
            });
        }
        clickableAreasContainer.appendChild(areaElement);
    });
}

// Save area
document.getElementById('save-area').addEventListener('click', function() {
    const newArea = {
        id: uid(),
        x: parseInt(document.getElementById('area-x').value),
        y: parseInt(document.getElementById('area-y').value),
        width: parseInt(document.getElementById('area-width').value),
        height: parseInt(document.getElementById('area-height').value),
        label: document.getElementById('area-label').value,
        room: document.getElementById('area-action').value,
        scale: baseScale
    };
    
    clickableAreas.push(newArea);
    document.getElementById('editor-panel').style.display = 'none';
    updateClickableAreas();
});

// Cancel adding area
document.getElementById('cancel-area').addEventListener('click', function() {
    document.getElementById('editor-panel').style.display = 'none';
});

