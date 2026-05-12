@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Nie znaleziono Node.js.
  echo.
  echo Aplikacje mozna tez opublikowac jako zwykla strone statyczna,
  echo np. na GitHub Pages, Netlify albo innym hostingu.
  echo.
  pause
  exit /b 1
)

start "" "http://127.0.0.1:4173/"
echo Strong22 dziala pod adresem:
echo http://127.0.0.1:4173/
echo.
echo Nie zamykaj tego okna, dopoki korzystasz z aplikacji.
echo.
node -e "const http=require('http'),fs=require('fs'),path=require('path');const root=process.cwd();const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.ico':'image/x-icon'};http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');const p=path.resolve(root,decodeURIComponent(url.pathname==='/'?'index.html':url.pathname.slice(1)));if(!p.startsWith(root)){res.writeHead(403);res.end('Forbidden');return;}fs.readFile(p,(err,data)=>{if(err){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream'});res.end(data);});}).listen(4173,'127.0.0.1');"
