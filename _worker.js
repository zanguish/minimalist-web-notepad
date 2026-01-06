export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (url.pathname === '/favicon.ico') {
            return this.handleFavicon(request);
        }

        const noteName = url.pathname.split('/')[1];

        // 定义禁止缓存的响应头
        const cacheHeaders = {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        };

        if (request.method === "GET") {
            return this.handleGet(request, noteName, env, cacheHeaders);
        } else if (request.method === "POST") {
            return this.handlePost(request, noteName, env, cacheHeaders);
        } else {
            return new Response("Method Not Allowed", {status: 405, headers: cacheHeaders});
        }
    },

    shuffleString(s) {
        return s.split('').sort(() => Math.random() - 0.5).join('');
    },

    // 检查 noteName 是否有效
    isValidNoteName(noteName) {
        return noteName && noteName.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(noteName);
    },

    // 检查是否需要返回原始内容
    shouldReturnRawContent(request) {
        const userAgent = request.headers.get("User-Agent") || "";
        const isCurlOrWget = /curl|wget/i.test(userAgent);
        const hasRawParam = new URL(request.url).searchParams.has('raw');

        return hasRawParam || isCurlOrWget;
    },

    // 处理GET请求
    async handleGet(request, noteName, env, cacheHeaders) {
        if (!this.isValidNoteName(noteName)) {
            const randomNote = this.shuffleString("234579abcdefghjkmnpqrstwxyz").slice(0, 5);
            return Response.redirect(new URL(`/${randomNote}`, request.url).href, 302);
        }

        const {results} = await env.DB.prepare(
            `SELECT text
             FROM note
             WHERE id = ?;`
        ).bind(noteName).all();

        let kv = results.length > 0 ? results[0].text : '';

        if (noteName === 'usage') {
            const url = new URL(request.url);
            let domin = url.protocol + "//" + url.hostname + "/";
            let exampleNote = this.shuffleString("234579abcdefghjkmnpqrstwxyz").slice(0, 5);
            kv = `cat /etc/hosts | curl ${domin}${exampleNote} --data-binary @-

curl ${domin}${exampleNote}
    `
        }

        if (this.shouldReturnRawContent(request)) {
            if (kv) {
                return new Response(kv + "\n", {status: 200, headers: cacheHeaders});
            } else {
                return new Response("404 Not Found\n", {status: 404, headers: cacheHeaders});
            }
        }

        return new Response(`
  <!DOCTYPE html>
  <html>
  <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${noteName}</title>
      <link rel="icon" href="favicon.ico" sizes="any">
      <style>
          body {
              margin: 0;
              background: #ebeef1;
          }

          .container {
              position: absolute;
              top: 20px;
              right: 20px;
              bottom: 20px;
              left: 20px;
          }

          #content {
              margin: 0;
              padding: 20px;
              overflow-y: auto;
              resize: none;
              width: 100%;
              height: 100%;
              box-sizing: border-box;
              border: 1px solid #ddd;
              outline: none;
          }

          #printable {
              display: none;
          }

          @media (prefers-color-scheme: dark) {
              body {
                  background: #333b4d;
              }

              #content {
                  background: #24262b;
                  color: #fff;
                  border-color: #495265;
              }
          }

          @media print {
              .container {
                  display: none;
              }

              #printable {
                  display: block;
                  white-space: pre-wrap;
                  word-break: break-word;
              }
          }
      </style>
  </head>
  <body>
  <div class="container">
      <textarea id="content">${kv}</textarea>
  </div>
  <pre id="printable"></pre>
  <script>
      function uploadContent() {
          if (content !== textarea.value) {
              var temp = textarea.value;
              var request = new XMLHttpRequest();
              request.open('POST', window.location.href, true);
              request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
              request.onload = function () {
                  if (request.readyState === 4) {

                      // If the request has ended, check again after 1 second.
                      content = temp;
                      setTimeout(uploadContent, 1000);
                  }
              }
              request.onerror = function () {

                  // Try again after 1 second.
                  setTimeout(uploadContent, 1000);
              }
              request.send('text=' + encodeURIComponent(temp));

              // Update the printable contents.
              printable.removeChild(printable.firstChild);
              printable.appendChild(document.createTextNode(temp));
          } else {

              // If the content has not changed, check again after 1 second.
              setTimeout(uploadContent, 1000);
          }
      }

      var textarea = document.getElementById('content');
      var printable = document.getElementById('printable');
      var content = textarea.value;

      // Initialize the printable contents with the initial value of the textarea.
      printable.appendChild(document.createTextNode(content));

      textarea.focus();
      uploadContent();
  </script>
  </body>
  </html>
  `, {
            headers: {
                "Content-Type": "text/html",
                ...cacheHeaders
            }
        });
    },

    // 处理POST请求
    async handlePost(request, noteName, env, cacheHeaders) {
        if (!this.isValidNoteName(noteName)) {
            return new Response("invalid note name\n", {status: 200, headers: cacheHeaders});
        }
        if (noteName === 'usage') {
            return new Response("ok\n", {status: 200, headers: cacheHeaders});
        }
        let inputText = '';
        const requestText = await request.text();

        if (requestText.length > 1024 * 1024) {
            return new Response("Text too large (max 1MB)\n", {status: 413, headers: cacheHeaders});
        }

        const contentType = request.headers.get("Content-Type") || "";
        if (contentType.includes("application/x-www-form-urlencoded")) {
            const formData = new URLSearchParams(requestText);
            inputText = formData.get('text') || '';
        } else {
            inputText = requestText;
        }

        if (inputText === "") {
            await env.DB.prepare(
                `DELETE
                 FROM note
                 WHERE id = ?;`
            ).bind(noteName).run();
        } else {
            const currentTime = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
            await env.DB.prepare(
                `INSERT INTO note (id, text, time)
                 VALUES (?, ?, ?) ON CONFLICT(id) DO
                UPDATE SET text = excluded.text, time = excluded.time;`
            ).bind(noteName, inputText, currentTime).run();
        }

        return new Response("ok\n", {status: 200, headers: cacheHeaders});
    },

    handleFavicon(request) {
        const faviconBase64 = "data:image/x-icon;base64,AAABAAEAEBAAAAEAIACuAAAAFgAAAIlQTkcNChoKAAAADUlIRFIAAAAQAAAAEAgGAAAAH/P/YQAAAHVJREFUeJxjYMACHEIy/hPC2PTBNU+Yvfx/ceMEMMbGxmkISHDTzkMEMUjdvqNnMA0BmQ5SALMRHcPksBqAbDsuzci2YxiArAgXRrYdxQBS/Y5hADm2ww0g13a4AeTajuICYjC6ZqzpABag2BSPJANghhCbpQEVgElDj5ToIgAAAABJRU5ErkJggg==";
        const favicon = fetch(faviconBase64)
            .then(res => res.arrayBuffer())
            .then(buffer => new Response(buffer, {
                headers: {
                    'Content-Type': 'image/x-icon',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            }));

        return favicon;
    },
};
