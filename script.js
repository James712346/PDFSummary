// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.mjs';
// Variables
let pdfDoc = null;
let baseScale = 1;
let canvas = document.getElementById('pdf-canvas');
let ctx = canvas.getContext('2d');
let renderContainer = document.getElementById('pdf-render-container');
renderContainer.currentScale = baseScale;
renderContainer.lastMoveX = 0;
renderContainer.lastMoveY = 0;
let pdfContainer = document.getElementById('pdf-container');
let clickableAreasContainer = document.getElementById('clickable-areas-container');
let startX, startY, moveX = 0, moveY = 0;
let isDragging = null;
let statusDisplay = document.getElementById('status');
let clickableAreas = [];
let areaVisibility = true;
let originalWidth, originalHeight;
let resizemoveflag = false;
let db = null;


const uid = function(){
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

document.getElementById('start').addEventListener('click', () => {
    const fileElement = document.getElementById('fileupload');
    const file = fileElement.files[0];
    if (!file){
        return 
    }

    sqlite3InitModule({ locateFile: "sqlite3.wasm"} ).then((sqlite3) => {
        const reader = new FileReader();
        const capi = sqlite3.capi/*C-style API*/, oo = sqlite3.oo1/*high-level OO API*/;
        console.log("sqlite3 version",capi.sqlite3_libversion(), capi.sqlite3_sourceid());
        reader.onload = function(element){
            const arrayBuffer = element.target.result;
            const p = sqlite3.wasm.allocFromTypedArray(arrayBuffer);
            db = new oo.DB();
            window.db = db;
            const rc = capi.sqlite3_deserialize(
                db.pointer, 'main', p, arrayBuffer.byteLength, arrayBuffer.byteLength,
                sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE
                | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE
            );
            db.checkRc(rc);
            console.log("Imported SQLite DB");

            let pdfData;
            db.exec({sql:`SELECT file FROM pdf;`,
                callback: (row) => {
                    pdfData = atob(row[0]);
                }})

            pdfjsLib.getDocument({data: pdfData}).promise.then(function(pdf) {
                pdfDoc = pdf;
                statusDisplay.textContent = 'PDF loaded successfully';

                // Initial render of the single pa ge
                renderPage();
            }).catch(function(error) {
                statusDisplay.textContent = `Error loading PDF: ${error.message}`;
                console.error('Error loading PDF:', error);
            })
        } 
        reader.readAsArrayBuffer(file);
    });
    document.getElementById("popup-welcome").style.display = 'none';
    document.getElementById('toolbar').style.display = 'flex';
    document.getElementById("pdf-container").style.filter = 'none';
});
// Render the page - we only do this once
function renderPage() {
    statusDisplay.textContent = 'Rendering page...';
    
    // Using promise to fetch the page (always page 1 since we have single page PDF)
    pdfDoc.getPage(1).then(function(page) {
        const viewport = page.getViewport({ scale: baseScale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // Store original dimensions for scaling
        originalWidth = viewport.width;
        originalHeight = viewport.height;
        
        // Render PDF page into canvas context
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        
        const renderTask = page.render(renderContext);

        
        // Wait for rendering to finish
        renderTask.promise.then(function() {
            statusDisplay.textContent = 'Page rendered successfully';
            // Apply initial transform
            applyTransform();
        }).catch(function(error) {
            statusDisplay.textContent = `Error rendering page: ${error.message}`;
            console.error('Error rendering page:', error);
        });
    });

}

    document.getElementById('resizeflag').addEventListener('click', function(){
        if (resizemoveflag){
            resizemoveflag = false;
            this.innerText = 'Enable Dragging/Resizing Areas'
            
        } else {
        this.innerText = 'Disable Dragging/Resizing Areas'
        resizemoveflag = true;
        }
        updateClickableAreas();
    });

// Export areas to JSON
document.getElementById('export-areas').addEventListener('click', function() {
    try {
        const jsonData = JSON.stringify(clickableAreas, null, 2);
        
        // Create a blob with the JSON data
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // Create a link to download the JSON file
        const a = document.createElement('a');
        a.href = url;
        a.download = 'clickable-areas.json';
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        statusDisplay.textContent = 'Areas exported successfully';
    } catch (error) {
        statusDisplay.textContent = `Error exporting areas: ${error.message}`;
        console.error('Error exporting areas:', error);
    }
});

// Import areas from JSON
document.getElementById('import-areas').addEventListener('click', function() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json';
    
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const importedAreas = JSON.parse(event.target.result);
                if (Array.isArray(importedAreas)) {
                    clickableAreas = importedAreas;
                    updateClickableAreas();
                    statusDisplay.textContent = `Imported ${importedAreas.length} areas successfully`;
                } else {
                    throw new Error('Invalid format: Expected array of areas');
                }
            } catch (error) {
                statusDisplay.textContent = `Error importing areas: ${error.message}`;
                console.error('Error importing areas:', error);
            }
        };
        
        reader.readAsText(file);
    });
    
    fileInput.click();
});


async function fetchAndImportAreas(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const importedAreas = await response.json();
        
        if (Array.isArray(importedAreas)) {
            clickableAreas = importedAreas;
            updateClickableAreas();
            statusDisplay.textContent = `Imported ${importedAreas.length} areas successfully`;
        } else {
            throw new Error('Invalid format: Expected array of areas');
        }
    } catch (error) {
        statusDisplay.textContent = `Error importing areas: ${error.message}`;
        console.error('Error importing areas:', error);
    }
}

// Apply transform based on current scale and position
function applyTransform() {
    renderContainer.style.transform = `translate(${moveX}px, ${moveY}px) scale(${renderContainer.currentScale})`;
    updateClickableAreas();
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

function updateClickableArea(area) {
    const areaElement = document.getElementById(area.id);
    areaElement.id = area.id;
    areaElement.className = 'clickable-area';
    areaElement.style.left = `${area.x}px`;
    areaElement.style.top = `${area.y}px`;
    areaElement.style.width = `${area.width}px`;
    areaElement.style.height = `${area.height}px`;
    areaElement.style.display = areaVisibility ? 'grid' : 'none';
}

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

// Add clickable area
document.getElementById('add-area').addEventListener('click', function() {
    document.getElementById('editor-panel').style.display = 'block';
    document.getElementById('area-label').value = `Area ${clickableAreas.length + 1}`;
    document.getElementById('area-action').value = `Room Name');`;
});

class sliders {
    constructor(slider, sqlStatment, sqlFilter){
        this.target = slider;
        this.sqlStatment = sqlStatment;
        this.sqlFilter = sqlFilter;
        this.default = this.target.innerHTML;
    }
    update(){
        clear();
    }
    sqlcallback(row){

    }
    clear(){
        this.target.innerHTML = this.default;
    }
}

class tableInformation {
    constructor(target, sqlStatment){
        this.target = target;
        this.sql = sql;
        this.filters = [];
        var sql = `select distinct responsible_company from hexagon_dump_tasks_dump t inner join hexagon_dump_assets a on a.asset_id = t.asset_id where location like '%270.11.091%';`
    }
    update(){
        clear();

    }
    sqlcallback(row){

    }
    clear(){
        target.innerHTML = '';
    }
}



function OpenRoomInformation(room){
    db.exec({sql:`SELECT * FROM hexagon_dump_assets where location LIKE '%${room}%' and asset_id NOT LIKE '%-%' ORDER BY LENGTH(asset_id);`,rowMode: 'object',
        callback: (row) => {
            document.getElementById("roomtitle").innerText = `<${row.location}>`
            document.getElementById("AssetorWorkpack").insertAdjacentHTML('beforeend',`<div class="slide" onclick="UpdateSubcontractor(this, '${row.asset_id}');"><h3>${row.asset_id}</h3><p>${row.description}</p></div>`)
        }})
    document.getElementById("AssetorWorkpack").firstElementChild.click();
    popupOpen();
}
window.OpenRoomInformation = OpenRoomInformation;
let currentAsset = null;

function UpdateSubcontractor(elem, asset_id){
    if (currentAsset != null) {
        currentAsset.style = ""
    }
    elem.style = 'background-color:#525659;color:white;'
    currentAsset = elem;
    document.getElementById("Subcontractor").innerHTML = `<div class="slide" onclick="UpdateTable(this,'${asset_id}', null);">
                    <p>All</p>
                </div>`
    db.exec({sql:`SELECT distinct responsible_company FROM hexagon_dump_tasks_dump where asset_id like '%${asset_id}%';`,rowMode: 'object',
        callback: (row) => {
            document.getElementById("Subcontractor").insertAdjacentHTML('beforeend',
                `<div class="slide" onclick="UpdateTable(this,'${asset_id}', '${row.responsible_company}');">
                    <p>${row.responsible_company}</p>
                </div>
                `)
            
        }})
    document.getElementById("Subcontractor").firstElementChild.click();
}
window.UpdateSubcontractor = UpdateSubcontractor;
let currentSubcontractor = null;

function openTaskid(task_id){
    console.log(task_id);
    const now = new Date();
    const oneWeekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);

    document.getElementById("TaskStepdata").innerHTML = '';
    db.exec({sql: `select * from hexagon_dump_task_steps_dump where task_id = '${task_id}' order by CAST(step_point as float);`,
            callback: (row) => {
                console.log(row)
                document.getElementById("TaskStepdata").insertAdjacentHTML('beforeend', `
                    <tr ${(new Date(row.completed_date) >= oneWeekAgo)?'style="rgb(144,238,144,0.3)"':''}>
                        <td ${(row.comments != null) ? 'rowspan="2"' : ''}>${row.step_point}</td>
                        <td>${row.step_action}</td>
                        <td>${row.inspection_type}</td>
                        <td>${(row.step_answer == null) ? '':row.step_answer}</td>
                        <td>${(row.is_required == 1) ? 'True' : 'False'}</td>
                    </tr>
                    `);
                if (row.comments != null){
                    document.getElementById("TaskStepdata").insertAdjacentHTML('beforeend', `
                        <tr class="comment">
                            <td colspan=4>Comments: ${row.comments}</td>
                        </tr>
                    `);
                }
            }, rowMode: 'object'});
    document.getElementById("popup-task").style = "display:block";
}
window.openTaskid = openTaskid;
function UpdateTable(elem,asset, subcontractor){
    if (currentSubcontractor != null) {
        currentSubcontractor.style = ""
    }
    elem.style = 'background-color:#525659;color:white;'
    currentSubcontractor = elem;
    document.getElementById("Taskdata").innerHTML = '';
    let sql = `SELECT * FROM hexagon_dump_tasks_dump where asset_id like '%${asset}%'` ;
    if (subcontractor != null){
        sql += ` and responsible_company = '${subcontractor}'`
    }
    sql += ` ORDER BY asset_id, LENGTH(asset_id);`
    const now = new Date();
    const oneWeekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    db.exec({sql:sql,rowMode: 'object',
        callback: (row) => {
            console.log(row)
            document.getElementById("Taskdata").insertAdjacentHTML('beforeend',
                `
                <tr ${(new Date(row.record_modified_date) >= oneWeekAgo)?'style="rgb(144,238,144,0.3)"':''} onclick="openTaskid('${row.task_id}')">
                    <td>${row.task_id}</td>
                    <td>${row.asset_id}</td>
                    <td>${row.task_state}</td>
                    <td>${row.description}</td>
                    <td>${(row.completion_percentage* 100).toFixed(2)} %</td>
                    <td>${row.total_count}</td>
                </tr>
                `)
            
        }})

}
window.UpdateTable = UpdateTable;

function popupOpen(){
    document.getElementById("toolbar").style.display = 'none';
    document.getElementById("popup-room").style.display = 'block';
    document.getElementById("pdf-container").style.filter = 'blur(4px)';
}
window.popupOpen = popupOpen
function popupClose(e) {
    let targetPopup = null;
    if (e.tagName == "DIV"){
        targetPopup = e.parentElement;
    } else {
        targetPopup = e.parentElement.parentElement.parentElement;
    }
    if (targetPopup.id == "popup-room"){
        document.getElementById("AssetorWorkpack").innerHTML = '';
        document.getElementById('toolbar').style.display = 'flex';
        document.getElementById("pdf-container").style.filter = 'none';
    }
    targetPopup.style.display = 'none';
};
window.popupClose = popupClose;


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

// Toggle visibility of clickable areas
document.getElementById('toggle-areas-visibility').addEventListener('click', function() {
    areaVisibility = !areaVisibility;
    this.textContent = areaVisibility ? 'Hide Areas' : 'Show Areas';
    updateClickableAreas();
});

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
