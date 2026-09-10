/* =========================================================
   Lector de Libros — app.js
   Escanea EPUB/PDF/TXT del celular y los lee en voz alta
   usando TTS nativo de Android (cordova-plugin-tts).
========================================================= */

(function () {
  'use strict';

  var CHUNK_WORD_COUNT = 60;   // tamaño de cada "bloque" leído
  var MAX_FILES = 300;         // tope de seguridad al escanear
  var SCAN_FOLDERS = ['', 'Download', 'Documents', 'Books', 'eBooks', 'Libros'];

  var state = {
    books: [],
    currentBook: null,
    chunks: [],
    chunkIndex: 0,
    isPlaying: false,
    rate: 1,
    locale: 'es-AR'
  };

  var els = {}; // referencias DOM, llenadas en init()

  document.addEventListener('deviceready', init, false);
  // Fallback para probar en un navegador de escritorio (sin plugins nativos)
  if (!window.cordova) {
    document.addEventListener('DOMContentLoaded', init, false);
  }

  function init() {
    cacheEls();
    bindEvents();

    if (window.pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    if (window.cordova && cordova.plugins && cordova.plugins.backgroundMode) {
      cordova.plugins.backgroundMode.setDefaults({
        title: 'Lector de Libros',
        text: 'Leyendo en segundo plano',
        silent: false
      });
    }
  }

  function cacheEls() {
    els.welcome = document.getElementById('screen-welcome');
    els.permission = document.getElementById('screen-permission');
    els.library = document.getElementById('screen-library');
    els.reader = document.getElementById('screen-reader');

    els.btnIngresar = document.getElementById('btn-ingresar');
    els.btnPermiso = document.getElementById('btn-permiso');
    els.btnRescan = document.getElementById('btn-rescan');
    els.btnBack = document.getElementById('btn-back');

    els.statusBanner = document.getElementById('status-banner');
    els.bookList = document.getElementById('book-list');

    els.readerTitle = document.getElementById('reader-title');
    els.readerText = document.getElementById('reader-text');
    els.progressFill = document.getElementById('progress-fill');

    els.btnPlay = document.getElementById('btn-play');
    els.btnPrev = document.getElementById('btn-retroceder');
    els.btnNext = document.getElementById('btn-avanzar');
    els.voiceSelect = document.getElementById('voice-select');
    els.rateRange = document.getElementById('rate-range');
  }

  function bindEvents() {
    els.btnIngresar.addEventListener('click', function () {
      showScreen('permission');
    });

    els.btnPermiso.addEventListener('click', requestPermissionAndScan);
    els.btnRescan.addEventListener('click', scanLibrary);

    els.btnBack.addEventListener('click', function () {
      stopReading();
      showScreen('library');
    });

    els.btnPlay.addEventListener('click', togglePlay);
    els.btnPrev.addEventListener('click', function () { jumpChunk(-1); });
    els.btnNext.addEventListener('click', function () { jumpChunk(1); });

    els.voiceSelect.addEventListener('change', function () {
      state.locale = els.voiceSelect.value;
      if (state.isPlaying) { restartCurrentChunk(); }
    });
    els.rateRange.addEventListener('change', function () {
      state.rate = parseFloat(els.rateRange.value);
      if (state.isPlaying) { restartCurrentChunk(); }
    });
  }

  function showScreen(name) {
    [els.welcome, els.permission, els.library, els.reader].forEach(function (s) {
      s.classList.remove('active');
    });
    els[name].classList.add('active');
  }

  function setStatus(msg) {
    if (!msg) {
      els.statusBanner.classList.remove('active');
      return;
    }
    els.statusBanner.textContent = msg;
    els.statusBanner.classList.add('active');
  }

  /* ---------------- Permisos ---------------- */

  function requestPermissionAndScan() {
    if (!window.cordova || !cordova.plugins || !cordova.plugins.permissions) {
      // Entorno de prueba sin plugin: seguimos igual
      showScreen('library');
      scanLibrary();
      return;
    }

    var permissions = cordova.plugins.permissions;
    var needed = [
      permissions.READ_EXTERNAL_STORAGE,
      permissions.WRITE_EXTERNAL_STORAGE
    ].filter(Boolean);

    permissions.requestPermissions(needed, function (status) {
      showScreen('library');
      scanLibrary();
    }, function () {
      setStatus('No se pudo pedir el permiso. Podés habilitarlo manualmente en Ajustes.');
      showScreen('library');
    });
  }

  /* ---------------- Escaneo de la biblioteca ---------------- */

  function scanLibrary() {
    state.books = [];
    renderBookList();
    setStatus('Buscando libros en tu celular...');

    var root = (window.cordova && window.cordova.file && cordova.file.externalRootDirectory) || null;
    if (!root) {
      setStatus('No se pudo acceder al almacenamiento (¿estás en el navegador?).');
      return;
    }

    var pending = SCAN_FOLDERS.length;
    var done = function () {
      pending--;
      if (pending <= 0) {
        setStatus(state.books.length ? '' : null);
        renderBookList();
      }
    };

    SCAN_FOLDERS.forEach(function (folder) {
      var url = root + folder;
      window.resolveLocalFileSystemURL(url, function (dirEntry) {
        scanDirRecursive(dirEntry, 2, done);
      }, function () {
        done(); // esa carpeta no existe, seguimos con las demás
      });
    });
  }

  function scanDirRecursive(dirEntry, depth, done) {
    if (state.books.length >= MAX_FILES) { return done(); }

    var reader = dirEntry.createReader();
    var allEntries = [];

    function readBatch() {
      reader.readEntries(function (entries) {
        if (!entries.length) {
          processEntries(allEntries);
          return;
        }
        allEntries = allEntries.concat(entries);
        readBatch(); // cordova-plugin-file entrega de a tandas
      }, function () { processEntries(allEntries); });
    }

    function processEntries(entries) {
      var subdirs = [];
      entries.forEach(function (entry) {
        var name = entry.name || '';
        if (name.charAt(0) === '.') { return; } // ocultos
        if (entry.isDirectory) {
          if (depth > 0 && subdirs.length < 10) { subdirs.push(entry); }
        } else if (isBookFile(name)) {
          state.books.push(makeBookFromEntry(entry));
        }
      });

      if (!subdirs.length || depth <= 0) { return done(); }

      var remaining = subdirs.length;
      subdirs.forEach(function (sub) {
        scanDirRecursive(sub, depth - 1, function () {
          remaining--;
          if (remaining <= 0) { done(); }
        });
      });
    }

    readBatch();
  }

  function isBookFile(name) {
    var lower = name.toLowerCase();
    return lower.endsWith('.epub') || lower.endsWith('.pdf') || lower.endsWith('.txt');
  }

  function makeBookFromEntry(entry) {
    var ext = entry.name.split('.').pop().toLowerCase();
    return {
      title: entry.name.replace(/\.(epub|pdf|txt)$/i, ''),
      ext: ext,
      nativeURL: entry.nativeURL,
      entry: entry,
      cover: null
    };
  }

  function renderBookList() {
    els.bookList.innerHTML = '';

    if (!state.books.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML =
        '<p>Todavía no encontramos libros. Guardá tus EPUB, PDF o TXT en la carpeta Descargas o Documentos y volvé a buscar.</p>';
      var btn = document.createElement('button');
      btn.className = 'btn small';
      btn.textContent = 'Buscar de nuevo';
      btn.addEventListener('click', scanLibrary);
      empty.appendChild(btn);
      els.bookList.appendChild(empty);
      return;
    }

    state.books
      .sort(function (a, b) { return a.title.localeCompare(b.title); })
      .forEach(function (book) {
        var li = document.createElement('li');
        li.className = 'book-row';

        var cover = document.createElement('div');
        cover.className = 'book-cover';
        cover.textContent = book.ext.toUpperCase();

        var info = document.createElement('div');
        info.className = 'book-info';
        info.innerHTML =
          '<div class="book-title">' + escapeHtml(book.title) + '</div>' +
          '<div class="book-meta">' + book.ext.toUpperCase() + '</div>';

        li.appendChild(cover);
        li.appendChild(info);
        li.addEventListener('click', function () { openBook(book); });
        els.bookList.appendChild(li);
      });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------------- Abrir y leer un libro ---------------- */

  function openBook(book) {
    state.currentBook = book;
    state.chunks = [];
    state.chunkIndex = 0;
    els.readerTitle.textContent = book.title;
    els.readerText.textContent = 'Cargando texto...';
    els.progressFill.style.width = '0%';
    showScreen('reader');

    extractText(book).then(function (text) {
      state.chunks = splitIntoChunks(text);
      state.chunkIndex = 0;
      renderCurrentChunk();
    }).catch(function (err) {
      els.readerText.textContent = 'No se pudo leer este archivo (' + (err && err.message ? err.message : err) + ').';
    });
  }

  function extractText(book) {
    if (book.ext === 'txt') { return extractTxt(book); }
    if (book.ext === 'pdf') { return extractPdf(book); }
    if (book.ext === 'epub') { return extractEpub(book); }
    return Promise.reject(new Error('Formato no soportado'));
  }

  function extractTxt(book) {
    return new Promise(function (resolve, reject) {
      window.resolveLocalFileSystemURL(book.nativeURL, function (fileEntry) {
        fileEntry.file(function (file) {
          var reader = new FileReader();
          reader.onload = function () { resolve(reader.result); };
          reader.onerror = reject;
          reader.readAsText(file, 'UTF-8');
        }, reject);
      }, reject);
    });
  }

  function extractPdf(book) {
    if (!window.pdfjsLib) { return Promise.reject(new Error('pdf.js no disponible')); }
    return pdfjsLib.getDocument(book.nativeURL).promise.then(function (pdf) {
      var pagePromises = [];
      for (var i = 1; i <= pdf.numPages; i++) {
        pagePromises.push(
          pdf.getPage(i).then(function (page) {
            return page.getTextContent().then(function (content) {
              return content.items.map(function (item) { return item.str; }).join(' ');
            });
          })
        );
      }
      return Promise.all(pagePromises).then(function (pages) { return pages.join('\n\n'); });
    });
  }

  function extractEpub(book) {
    if (!window.JSZip) { return Promise.reject(new Error('JSZip no disponible')); }

    return readAsArrayBuffer(book.nativeURL)
      .then(function (buffer) { return JSZip.loadAsync(buffer); })
      .then(function (zip) {
        return zip.file('META-INF/container.xml').async('text').then(function (containerXml) {
          var rootfilePath = /full-path="([^"]+)"/.exec(containerXml)[1];
          var basePath = rootfilePath.split('/').slice(0, -1).join('/');
          basePath = basePath ? basePath + '/' : '';

          return zip.file(rootfilePath).async('text').then(function (opfXml) {
            var manifest = {};
            var manifestRegex = /<item[^>]+id="([^"]+)"[^>]+href="([^"]+)"/g;
            var m;
            while ((m = manifestRegex.exec(opfXml))) { manifest[m[1]] = m[2]; }

            var spineIds = [];
            var spineRegex = /<itemref[^>]+idref="([^"]+)"/g;
            while ((m = spineRegex.exec(opfXml))) { spineIds.push(m[1]); }

            var files = spineIds.map(function (id) { return manifest[id]; }).filter(Boolean);

            var textPromises = files.map(function (href) {
              var path = basePath + href;
              var zf = zip.file(path) || zip.file(decodeURIComponent(path));
              if (!zf) { return Promise.resolve(''); }
              return zf.async('text').then(htmlToText);
            });

            return Promise.all(textPromises).then(function (parts) { return parts.join('\n\n'); });
          });
        });
      });
  }

  function readAsArrayBuffer(nativeURL) {
    return new Promise(function (resolve, reject) {
      window.resolveLocalFileSystemURL(nativeURL, function (fileEntry) {
        fileEntry.file(function (file) {
          var reader = new FileReader();
          reader.onload = function () { resolve(reader.result); };
          reader.onerror = reject;
          reader.readAsArrayBuffer(file);
        }, reject);
      }, reject);
    });
  }

  function htmlToText(html) {
    var div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function splitIntoChunks(text) {
    var words = text.replace(/\s+/g, ' ').trim().split(' ');
    var chunks = [];
    for (var i = 0; i < words.length; i += CHUNK_WORD_COUNT) {
      chunks.push(words.slice(i, i + CHUNK_WORD_COUNT).join(' '));
    }
    return chunks.length ? chunks : ['(Este libro no tiene texto para leer.)'];
  }

  /* ---------------- Lectura (TTS) ---------------- */

  function renderCurrentChunk() {
    els.readerText.textContent = state.chunks[state.chunkIndex] || '';
    var pct = state.chunks.length ? (state.chunkIndex / state.chunks.length) * 100 : 0;
    els.progressFill.style.width = pct + '%';
    els.readerText.parentElement.scrollTop = 0;
  }

  function togglePlay() {
    if (state.isPlaying) { pauseReading(); } else { playCurrentChunk(); }
  }

  function playCurrentChunk() {
    if (!state.chunks.length) { return; }
    state.isPlaying = true;
    els.btnPlay.textContent = '❚❚';
    enableBackgroundMode(true);
    speakChunk(state.chunkIndex);
  }

  function speakChunk(index) {
    if (index >= state.chunks.length) { stopReading(); return; }
    renderCurrentChunk();

    var text = state.chunks[index];
    ttsSpeak(text).then(function () {
      if (!state.isPlaying) { return; } // se pausó mientras hablaba
      state.chunkIndex = index + 1;
      speakChunk(state.chunkIndex);
    }).catch(function () {
      // si falla el TTS, no trabamos la app
      state.isPlaying = false;
      els.btnPlay.textContent = '▶';
    });
  }

  function ttsSpeak(text) {
    if (!window.TTS) { return Promise.reject(new Error('TTS no disponible')); }
    var options = { text: text, locale: state.locale, rate: state.rate };
    var result = TTS.speak(options);
    if (result && typeof result.then === 'function') { return result; }
    // API con callbacks (forks más viejos del plugin)
    return new Promise(function (resolve, reject) {
      TTS.speak(options, resolve, reject);
    });
  }

  function pauseReading() {
    state.isPlaying = false;
    els.btnPlay.textContent = '▶';
    ttsStop();
    enableBackgroundMode(false);
  }

  function stopReading() {
    state.isPlaying = false;
    els.btnPlay.textContent = '▶';
    ttsStop();
    enableBackgroundMode(false);
  }

  function ttsStop() {
    if (!window.TTS) { return; }
    if (typeof TTS.stop === 'function') { TTS.stop(); }
    else if (typeof TTS.stopSpeaking === 'function') { TTS.stopSpeaking(); }
  }

  function restartCurrentChunk() {
    ttsStop();
    if (state.isPlaying) { speakChunk(state.chunkIndex); }
  }

  function jumpChunk(delta) {
    var next = state.chunkIndex + delta;
    if (next < 0) { next = 0; }
    if (next >= state.chunks.length) { next = state.chunks.length - 1; }
    state.chunkIndex = next;
    renderCurrentChunk();
    if (state.isPlaying) {
      ttsStop();
      speakChunk(state.chunkIndex);
    }
  }

  function enableBackgroundMode(on) {
    if (!window.cordova || !cordova.plugins || !cordova.plugins.backgroundMode) { return; }
    if (on) { cordova.plugins.backgroundMode.enable(); }
    else { cordova.plugins.backgroundMode.disable(); }
  }

})();
