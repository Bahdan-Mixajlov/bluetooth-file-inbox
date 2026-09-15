const pickFolderBtn = document.querySelector("#pickFolderBtn");
const folderTag = document.querySelector("#folderTag");
const folderName = document.querySelector("#folderName");
const feed = document.querySelector("#feed");
const emptyState = document.querySelector("#emptyState");

const pcView = document.querySelector("#pcView");
const mobileView = document.querySelector("#mobileView");
const fileInput = document.querySelector("#fileInput");
const selectFileBtn = document.querySelector("#selectFileBtn");
const mobileStatus = document.querySelector("#mobileStatus");

let dirHandle = null;
let knownFiles = new Map();
let pollTimer = null;
let observer = null;

const peerConfig = {
  host: "0.peerjs.com",
  port: 443,
  secure: true,
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  },
};

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
  if (emptyState) emptyState.style.display = "none";
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
      }
    }
  } catch (err) {}
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
    } catch (err) {}
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
  } catch (err) {}
});

const urlParams = new URLSearchParams(window.location.search);
const targetRoom = urlParams.get("room");

if (targetRoom) {
  pcView.style.display = "none";
  mobileView.style.display = "block";

  const peer = new Peer(peerConfig);

  peer.on("open", () => {
    mobileStatus.textContent = "Соединение с ПК...";
    const conn = peer.connect(targetRoom);

    conn.on("open", () => {
      mobileStatus.textContent = "Подключено к ПК";
      selectFileBtn.disabled = false;

      selectFileBtn.addEventListener("click", () => fileInput.click());

      fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        mobileStatus.textContent = `Отправка ${file.name}...`;

        conn.send({
          file: file,
          name: file.name,
          size: file.size,
        });

        mobileStatus.textContent = "Отправлено";
        setTimeout(() => {
          mobileStatus.textContent = "Подключено к ПК";
        }, 2000);
      });
    });

    conn.on("close", () => {
      mobileStatus.textContent = "Связь с ПК потеряна";
      selectFileBtn.disabled = true;
    });
  });
} else {
  const peer = new Peer(peerConfig);

  peer.on("open", (id) => {
    const mobileUrl = `${window.location.origin}${window.location.pathname}?room=${id}`;

    new QRCode(document.getElementById("qrcode"), {
      text: mobileUrl,
      width: 128,
      height: 128,
      correctLevel: QRCode.CorrectLevel.M,
    });
  });

  peer.on("connection", (conn) => {
    conn.on("data", (data) => {
      const receivedFile = new File([data.file], data.name, {
        type: data.file.type,
      });
      renderFile(receivedFile);
    });
  });
}
