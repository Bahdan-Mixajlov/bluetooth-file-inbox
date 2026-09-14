const pickFolderBtn = document.querySelector("#pickFolderBtn");
const statusDot = document.querySelector("#statusDot");
const statusText = document.querySelector("#statusText");
const folderTag = document.querySelector("#folderTag");
const folderName = document.querySelector("#folderName");
const feed = document.querySelector("#feed");
const emptyState = document.querySelector("#emptyState");
const logEl = document.querySelector("#log");
const unsupportedWarning = document.querySelector("#unsupportedWarning");

let dirHandle = null;
let knownFiles = new Map();
let pollTimer = null;
let observer = null;

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " Б";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " КБ";
  return (bytes / (1024 * 1024)).toFixed(1) + " МБ";
}

function extBadge(name) {
  const ext = name.includes(".") ? name.split(".").pop().toUpperCase() : "?";
  return ext.slice(0, 4);
}

function renderFile(file) {
  emptyState.style.display = "none";
  const url = URL.createObjectURL(file);
  const card = document.createElement("div");
  card.className = "file-card";
  card.innerHTML = `
    <div class="file-icon">${extBadge(file.name)}</div>
    <div class="file-meta">
      <div class="file-name">${file.name}</div>
      <div class="file-sub">${formatSize(file.size)}</div>
    </div>
    <div class="file-actions">
      <a href="${url}" download="${file.name}">Сохранить</a>
    </div>
  `;
  feed.prepend(card);
}

async function scanFolder() {
  if (!dirHandle) return;
  try {
    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind !== "file") continue;
      const file = await handle.getFile();
      const seen = knownFiles.get(name);
      if (!seen || seen.lastModified !== file.lastModified) {
        knownFiles.set(name, {
          size: file.size,
          lastModified: file.lastModified,
        });
        if (seen) continue;
        renderFile(file);
        console.log(`Новый файл: ${name} (${formatSize(file.size)})`);
      }
    }
  } catch (err) {
    console.log(`Ошибка чтения папки: ${err.message}`);
  }
}

async function primeKnownFiles() {
  knownFiles.clear();
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind !== "file") continue;
    const file = await handle.getFile();
    knownFiles.set(name, { size: file.size, lastModified: file.lastModified });
  }
}

async function startWatching() {
  await primeKnownFiles();

  if ("FileSystemObserver" in window) {
    try {
      observer = new FileSystemObserver(() => scanFolder());
      await observer.observe(dirHandle);
      return;
    } catch (err) {
      console.log(err);
    }
  }

  pollTimer = setInterval(scanFolder, 2000);
}

pickFolderBtn.addEventListener("click", async () => {
  try {
    dirHandle = await window.showDirectoryPicker();
    folderName.textContent = dirHandle.name;
    folderTag.style.display = "flex";
    pickFolderBtn.textContent = "Папка выбрана";
    pickFolderBtn.disabled = true;
    await startWatching();
  } catch (err) {
    if (err.name !== "AbortError") console.log(err.message);
  }
});

if (!("showDirectoryPicker" in window)) {
  unsupportedWarning.style.display = "block";
  pickFolderBtn.disabled = true;
}
