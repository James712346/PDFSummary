// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.mjs';

document.getElementById('start').addEventListener('click', () => {
    const fileElement = document.getElementById('fileInput');
    const file = fileElement.files[0];
    if (!file) {
        console.error("No File Selected!")
        return
    }

    sqlite3InitModule({ locateFile: "sqlite3.wasm" }).then((sqlite3) => {
        gsqlite3 = sqlite3;
        const reader = new FileReader();
        const capi = sqlite3.capi/*C-style API*/, oo = sqlite3.oo1/*high-level OO API*/;
        console.log("sqlite3 version", capi.sqlite3_libversion(), capi.sqlite3_sourceid());
        reader.onload = function (element) {
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
            const createTableQuery = `
                CREATE TABLE IF NOT EXISTS clickableAreas (
                    id TEXT PRIMARY KEY,
                    x REAL,
                    y REAL,
                    width REAL,
                    height REAL,
                    label TEXT,
                    room TEXT,
                    scale REAL
                );
            `;
            db.exec({sql:createTableQuery});

            let pdfData;
            db.exec({
                sql: `SELECT file FROM pdf;`,
                callback: (row) => {
                    pdfData = atob(row[0]);
                }
            })

            db.exec({
                sql: `select * from clickableAreas`,
                callback: (row) => {
                    clickableAreas.push(row)
                },
                rowMode:'object'
            })

            pdfjsLib.getDocument({ data: pdfData }).promise.then(function (pdf) {
                pdfDoc = pdf;
                statusDisplay.textContent = 'PDF loaded successfully';

                // Initial render of the single pa ge
                renderPage();
            }).catch(function (error) {
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
    pdfDoc.getPage(1).then(function (page) {
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
        renderTask.promise.then(function () {
            statusDisplay.textContent = 'Page rendered successfully';
            // Apply initial transform
            applyTransform();
        }).catch(function (error) {
            statusDisplay.textContent = `Error rendering page: ${error.message}`;
            console.error('Error rendering page:', error);
        });
    });

}

document.getElementById('resizeflag').addEventListener('click', function () {
    if (resizemoveflag) {
        resizemoveflag = false;
        this.innerText = 'Enable Dragging/Resizing Areas'

    } else {
        this.innerText = 'Disable Dragging/Resizing Areas'
        resizemoveflag = true;
    }
    updateClickableAreas();
});

// Export areas to JSON
document.getElementById('export-areas').addEventListener('click', function () {
    try {
        const insertIfNotExists = (area) => {
            const checkQuery = `SELECT COUNT(*) AS count FROM clickableAreas WHERE id = ?`;
            
            const result = db.exec({sql:checkQuery, callback:(row) =>{
                if (row[0] === 0) {
                    const insertQuery = `
                        INSERT OR REPLACE INTO clickableAreas (id, x, y, width, height, label, room, scale)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `;
                    db.exec({sql:insertQuery, bind:[area.id, area.x, area.y, area.width, area.height, area.label, area.room, area.scale]});
                } else {
                    const updateQuery =`
                        UPDATE clickableAreas SET x=?, y=?, width=?, height=?, label=?, room=?, scale=?
                        where id = ?
                    `
                    db.exec({sql:updateQuery, bind:[area.x, area.y, area.width, area.height, area.label, area.room, area.scale, area.id]});
                }
            }});
        };
        // Loop through clickableAreas and insert if id doesn't exist
        clickableAreas.forEach(insertIfNotExists);

        // Export DB to binary
        const byteArray = gsqlite3.capi.sqlite3_js_db_export(db);

        // Convert the Uint8Array to a Blob
        const blob = new Blob([byteArray], { type: 'application/x-sqlite3' });
        const url = URL.createObjectURL(blob);

        // Create a link to download the JSON file
        const a = document.createElement('a');
        a.href = url;
        a.download = 'export.db';
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



// Add clickable area
document.getElementById('add-area').addEventListener('click', function () {
    document.getElementById('editor-panel').style.display = 'block';
    document.getElementById('area-label').value = `Area ${clickableAreas.length + 1}`;
    document.getElementById('area-action').value = `Room Name');`;
});



function OpenRoomInformation(room) {
    db.exec({
        sql: `SELECT * FROM hexagon_dump_assets where location LIKE '%${room}%' and asset_id NOT LIKE '%-%' ORDER BY LENGTH(asset_id);`, rowMode: 'object',
        callback: (row) => {
            document.getElementById("roomtitle").innerText = `<${row.location}>`
            document.getElementById("AssetorWorkpack").insertAdjacentHTML('beforeend', `<div class="slide" onclick="UpdateSubcontractor(this, '${row.asset_id}');"><h3>${row.asset_id}</h3><p>${row.description}</p></div>`)
        }
    })
    document.getElementById("AssetorWorkpack").firstElementChild.click();
    popupOpen();
}
window.OpenRoomInformation = OpenRoomInformation;
let currentAsset = null;

function UpdateSubcontractor(elem, asset_id) {
    if (currentAsset != null) {
        currentAsset.style = ""
    }
    elem.style = 'background-color:#525659;color:white;'
    currentAsset = elem;
    document.getElementById("Subcontractor").innerHTML = `<div class="slide" onclick="UpdateTable(this,'${asset_id}', null);">
                    <p>All</p>
                </div>`
    db.exec({
        sql: `SELECT distinct responsible_company FROM hexagon_dump_tasks_dump where asset_id like '%${asset_id}%';`, rowMode: 'object',
        callback: (row) => {
            document.getElementById("Subcontractor").insertAdjacentHTML('beforeend',
                `<div class="slide" onclick="UpdateTable(this,'${asset_id}', '${row.responsible_company}');">
                    <p>${row.responsible_company}</p>
                </div>
                `)

        }
    })
    document.getElementById("Subcontractor").firstElementChild.click();
}
window.UpdateSubcontractor = UpdateSubcontractor;
let currentSubcontractor = null;

function openTaskid(task_id) {
    console.log(task_id);
    const now = new Date();
    const oneWeekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);

    document.getElementById("TaskStepdata").innerHTML = '';
    db.exec({
        sql: `select * from hexagon_dump_task_steps_dump where task_id = '${task_id}' order by CAST(step_point as float);`,
        callback: (row) => {
            console.log(row)
            document.getElementById("TaskStepdata").insertAdjacentHTML('beforeend', `
                    <tr ${(new Date(row.completed_date) >= oneWeekAgo) ? 'style="rgb(144,238,144,0.3)"' : ''}>
                        <td ${(row.comments != null) ? 'rowspan="2"' : ''}>${row.step_point}</td>
                        <td>${row.step_action}</td>
                        <td>${row.inspection_type}</td>
                        <td>${(row.step_answer == null) ? '' : row.step_answer}</td>
                        <td>${(row.is_required == 1) ? 'True' : 'False'}</td>
                    </tr>
                    `);
            if (row.comments != null) {
                document.getElementById("TaskStepdata").insertAdjacentHTML('beforeend', `
                        <tr class="comment">
                            <td colspan=4>Comments: ${row.comments}</td>
                        </tr>
                    `);
            }
        }, rowMode: 'object'
    });
    document.getElementById("popup-task").style = "display:block";
}
window.openTaskid = openTaskid;
function UpdateTable(elem, asset, subcontractor) {
    if (currentSubcontractor != null) {
        currentSubcontractor.style = ""
    }
    elem.style = 'background-color:#525659;color:white;'
    currentSubcontractor = elem;
    document.getElementById("Taskdata").innerHTML = '';
    let sql = `SELECT * FROM hexagon_dump_tasks_dump where asset_id like '%${asset}%'`;
    if (subcontractor != null) {
        sql += ` and responsible_company = '${subcontractor}'`
    }
    sql += ` ORDER BY asset_id, LENGTH(asset_id);`
    const now = new Date();
    const oneWeekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    db.exec({
        sql: sql, rowMode: 'object',
        callback: (row) => {
            console.log(row)
            document.getElementById("Taskdata").insertAdjacentHTML('beforeend',
                `
                <tr ${(new Date(row.record_modified_date) >= oneWeekAgo) ? 'style="rgb(144,238,144,0.3)"' : ''} onclick="openTaskid('${row.task_id}')">
                    <td>${row.task_id}</td>
                    <td>${row.asset_id}</td>
                    <td>${row.task_state}</td>
                    <td>${row.description}</td>
                    <td>${(row.completion_percentage * 100).toFixed(2)} %</td>
                    <td>${row.total_count}</td>
                </tr>
                `)

        }
    })

}
window.UpdateTable = UpdateTable;

function popupOpen() {
    document.getElementById("toolbar").style.display = 'none';
    document.getElementById("popup-room").style.display = 'block';
    document.getElementById("pdf-container").style.filter = 'blur(4px)';
}
window.popupOpen = popupOpen
function popupClose(e) {
    let targetPopup = null;
    if (e.tagName == "DIV") {
        targetPopup = e.parentElement;
    } else {
        targetPopup = e.parentElement.parentElement.parentElement;
    }
    if (targetPopup.id == "popup-room") {
        document.getElementById("AssetorWorkpack").innerHTML = '';
        document.getElementById('toolbar').style.display = 'flex';
        document.getElementById("pdf-container").style.filter = 'none';
    }
    targetPopup.style.display = 'none';
};
window.popupClose = popupClose;


