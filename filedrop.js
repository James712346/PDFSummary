const fileDrop = document.getElementById('fileDrop');
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');

fileDrop.addEventListener('dragover', (event) => {
    event.preventDefault();
    fileDrop.style.backgroundColor = '#EF5A00';
    fileDrop.style.color = '#fff';
});

fileDrop.addEventListener('dragleave', () => {
    fileDrop.style.backgroundColor = '#fff';
    fileDrop.style.color = '#EF5A00';
});

fileDrop.addEventListener('drop', (event) => {
    event.preventDefault();
    fileDrop.style.backgroundColor = '#fff';
    fileDrop.style.color = '#EF5A00';
    const files = event.dataTransfer.files;
    if (files.length > 1) {
        alert('Please upload only one file.');
        return;
    }
    fileInput.files = files;
    displayFile(files[0]);
});

fileDrop.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 1) {
        alert('Please upload only one file.');
        fileInput.value = '';
        return;
    }
    displayFile(fileInput.files[0]);
});

function displayFile(file) {
    fileName.textContent = "Uploaded File: " + file.name;
}