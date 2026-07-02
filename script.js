const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const quality = document.getElementById('quality');
const qualityValue = document.getElementById('qualityValue');
const format = document.getElementById('format');
const targetSize = document.getElementById('targetSize');
const useTargetSize = document.getElementById('useTargetSize');
const maxWidth = document.getElementById('maxWidth');
const useResize = document.getElementById('useResize');
const results = document.getElementById('results');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const actionsBar = document.getElementById('actionsBar');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const clearBtn = document.getElementById('clearBtn');

let totalFiles = 0;
let processedFiles = 0;
let compressedFiles = [];

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

quality.addEventListener('input', (e) => {
    qualityValue.textContent = e.target.value;
});

downloadAllBtn.addEventListener('click', downloadAllAsZip);
clearBtn.addEventListener('click', clearResults);

function updateActionsBar() {
    if (compressedFiles.length > 0) {
        actionsBar.style.display = 'flex';
        downloadAllBtn.textContent = `Скачать все архивом (${compressedFiles.length})`;
    } else {
        actionsBar.style.display = 'none';
    }
}

async function downloadAllAsZip() {
    if (compressedFiles.length === 0) return;
    
    downloadAllBtn.disabled = true;
    const originalText = downloadAllBtn.textContent;
    downloadAllBtn.textContent = 'Создание архива...';
    
    try {
        const zip = new JSZip();
        const folder = zip.folder('compressed_images');
        
        compressedFiles.forEach((file, index) => {
            const filename = `compressed_${index + 1}_${file.filename.replace(/\.[^/.]+$/, '')}.${file.ext}`;
            folder.file(filename, file.blob);
            
            const progress = Math.round(((index + 1) / compressedFiles.length) * 100);
            downloadAllBtn.textContent = `Добавление файлов... ${progress}%`;
        });
        
        downloadAllBtn.textContent = 'Архивирование...';
        
        const content = await zip.generateAsync({type: 'blob'}, (metadata) => {
            downloadAllBtn.textContent = `Архивирование... ${metadata.percent.toFixed(0)}%`;
        });
        
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        a.download = `compressed_images_${timestamp}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        downloadAllBtn.textContent = 'Готово!';
        setTimeout(() => {
            downloadAllBtn.disabled = false;
            downloadAllBtn.textContent = originalText;
        }, 1500);
        
    } catch (error) {
        console.error('Ошибка создания архива:', error);
        alert('Произошла ошибка при создании архива. Попробуйте скачать файлы по отдельности.');
        downloadAllBtn.disabled = false;
        downloadAllBtn.textContent = originalText;
    }
}

function clearResults() {
    compressedFiles = [];
    results.innerHTML = '';
    updateActionsBar();
}

function updateProgress(current, total, currentFileName, percent) {
    const overallPercent = total > 0 ? Math.round((current / total) * 100) : 0;
    progressFill.style.width = overallPercent + '%';
    
    if (currentFileName) {
        progressText.innerHTML = `
            Файл ${current} из ${total}: <strong>${currentFileName}</strong><br>
            Прогресс сжатия: <strong>${percent}%</strong> | 
            Общий прогресс: <strong>${overallPercent}%</strong>
        `;
    }
}

async function handleFiles(files) {
    if (files.length === 0) return;
    
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
        alert('Пожалуйста, выберите изображения для сжатия');
        return;
    }
    
    totalFiles = imageFiles.length;
    processedFiles = 0;
    
    progressContainer.style.display = 'block';
    results.innerHTML = '';
    compressedFiles = [];
    
    for (const file of imageFiles) {
        await processFile(file);
    }
    
    setTimeout(() => {
        progressContainer.style.display = 'none';
        progressFill.style.width = '0%';
    }, 2000);
}

async function processFile(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const img = new Image();
            img.onload = async () => {
                const originalSize = file.size / 1024;
                let blob;
                
                const resizeEnabled = useResize.checked;
                const maxW = resizeEnabled ? parseInt(maxWidth.value) : null;
                
                if (useTargetSize.checked) {
                    blob = await compressToTargetSize(img, parseInt(targetSize.value), file.name, maxW);
                } else {
                    updateProgress(processedFiles + 1, totalFiles, file.name, 0);
                    blob = await compressWithQuality(img, parseFloat(quality.value), maxW);
                }
                
                displayResult(file, blob, originalSize);
                processedFiles++;
                updateProgress(processedFiles, totalFiles, null, 100);
                resolve();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function compressWithQuality(img, quality, maxWidth = null) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (maxWidth && width > maxWidth) {
            height = Math.round((maxWidth / width) * height);
            width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        if (format.value === 'image/jpeg') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => resolve(blob), format.value, quality);
    });
}

async function compressToTargetSize(img, targetKB, fileName, maxWidth = null) {
    let minQ = 0.5;
    let maxQ = 1.0;
    let bestBlob = null;
    let bestDiff = Infinity;
    
    for (let i = 0; i < 10; i++) {
        const midQ = (minQ + maxQ) / 2;
        const progressPercent = Math.round((i / 10) * 100);
        
        updateProgress(processedFiles + 1, totalFiles, fileName, progressPercent);
        
        const blob = await compressWithQuality(img, midQ, maxWidth);
        const sizeKB = blob.size / 1024;
        const diff = Math.abs(sizeKB - targetKB);
        
        if (diff < bestDiff) {
            bestDiff = diff;
            bestBlob = blob;
        }
        
        if (sizeKB > targetKB) {
            maxQ = midQ;
        } else {
            minQ = midQ;
        }
        
        if (diff < targetKB * 0.05) break;
        
        await new Promise(r => setTimeout(r, 50));
    }
    
    return bestBlob;
}

function formatFileSize(kb) {
    if (kb >= 1024) {
        return (kb / 1024).toFixed(1) + ' MB';
    }
    return Math.round(kb) + ' KB';
}

function displayResult(originalFile, compressedBlob, originalSizeKB) {
    const compressedSizeKB = compressedBlob.size / 1024;
    const savings = ((originalSizeKB - compressedSizeKB) / originalSizeKB * 100).toFixed(1);
    
    const originalSizeText = formatFileSize(originalSizeKB);
    const compressedSizeText = formatFileSize(compressedSizeKB);
    
    const item = document.createElement('div');
    item.className = 'file-item';
    
    let warnings = '';
    
    if (savings < 20) {
        warnings += '<div class="warning">Файл уже оптимизирован. Попробуйте изменить размер или использовать WebP.</div>';
    }
    
    if (format.value === 'image/jpeg' && parseFloat(quality.value) < 0.7) {
        warnings += '<div class="warning">Низкое качество может вызвать артефакты на градиентах (небо, тени).</div>';
    }
    
    item.innerHTML = `
        <h3>${originalFile.name}</h3>
        <div class="stats">
            <p><strong>Оригинал:</strong> ${originalSizeKB.toFixed(1)} KB</p>
            <p><strong>Сжатый:</strong> ${compressedSizeKB.toFixed(1)} KB</p>
            <p><strong>Экономия:</strong> <span style="color: #4CAF50; font-weight: bold;">${savings}%</span></p>
        </div>
        ${warnings}
        <div class="comparison-slider">
            <img class="before-img" src="${URL.createObjectURL(originalFile)}" alt="Оригинал">
            <img class="after-img" src="${URL.createObjectURL(compressedBlob)}" alt="Сжатый">
            <div class="slider-handle">
                <div class="slider-button"></div>
            </div>
            <div class="label label-before">
                <span class="label-title">ORIGINAL</span>
                <span class="label-size">${originalSizeText}</span>
            </div>
            <div class="label label-after">
                <span class="label-title">COMPRESSED</span>
                <span class="label-size">${compressedSizeText}</span>
            </div>
        </div>
        <button onclick="downloadResult(this)">Скачать сжатое изображение</button>
    `;
    
    item.blob = compressedBlob;
    item.filename = originalFile.name;
    results.appendChild(item);
    
    initSlider(item.querySelector('.comparison-slider'));
    
    const ext = compressedBlob.type.split('/')[1] || 'jpg';
    compressedFiles.push({
        blob: compressedBlob,
        filename: originalFile.name,
        ext: ext
    });
    
    updateActionsBar();
}

function initSlider(slider) {
    const handle = slider.querySelector('.slider-handle');
    const beforeImg = slider.querySelector('.before-img');
    let isDragging = false;
    
    function updatePosition(x) {
        const rect = slider.getBoundingClientRect();
        let percent = ((x - rect.left) / rect.width) * 100;
        percent = Math.max(0, Math.min(100, percent));
        
        handle.style.left = percent + '%';
        beforeImg.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
    }
    
    slider.addEventListener('mousedown', (e) => {
        isDragging = true;
        updatePosition(e.clientX);
    });
    
    slider.addEventListener('touchstart', (e) => {
        isDragging = true;
        updatePosition(e.touches[0].clientX);
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        updatePosition(e.clientX);
    });
    
    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        updatePosition(e.touches[0].clientX);
    });
    
    document.addEventListener('mouseup', () => isDragging = false);
    document.addEventListener('touchend', () => isDragging = false);
    
    slider.addEventListener('dblclick', () => {
        updatePosition(slider.getBoundingClientRect().left + slider.getBoundingClientRect().width / 2);
    });
}

function downloadResult(button) {
    const item = button.closest('.file-item');
    const url = URL.createObjectURL(item.blob);
    const a = document.createElement('a');
    a.href = url;
    const ext = item.blob.type.split('/')[1] || 'jpg';
    a.download = 'compressed_' + item.filename.replace(/\.[^/.]+$/, '') + '.' + ext;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
