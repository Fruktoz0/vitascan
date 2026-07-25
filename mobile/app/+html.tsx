import { ScrollViewStyleReset } from 'expo-router/html';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hu">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/*
          maximum-scale=1 + user-scalable=no: iOS ne zoomoljon be TextInput fókuszra
          (font-size < 16px esetén), és ne maradjon zoomolt az app.
          viewport-fit=cover: notch / home indicator — a SafeAreaView kezeli a inseteket,
          body-n NEM adunk külön safe-area paddingot (dupla hézag elkerülése).
        */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />

        <title>VitaScan</title>
        <meta name="description" content="Táplálkozás-követő és vonalkód-szkenner alkalmazás" />
        <meta name="theme-color" content="#FF9A6C" />

        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/icon.png" />

        {/* iOS standalone / full-screen */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="VitaScan" />

        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: rootStyles }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const rootStyles = `
html, body {
  height: 100%;
  -webkit-tap-highlight-color: transparent;
}
html, body, #root {
  height: 100%;
  height: 100dvh;
  min-height: 100dvh;
  margin: 0;
  padding: 0;
  background-color: #fcf8f8;
  touch-action: pan-x pan-y;
  -webkit-text-size-adjust: 100%;
  overflow: hidden;
}
/* iOS Safari auto-zooms inputs with font-size < 16px — force 16px on web */
input, textarea, select, [contenteditable="true"] {
  font-size: 16px !important;
  outline: none !important;
  box-shadow: none !important;
  -webkit-tap-highlight-color: transparent !important;
  -webkit-appearance: none;
  appearance: none;
}
input:focus, textarea:focus, select:focus,
input:focus-visible, textarea:focus-visible {
  outline: none !important;
  box-shadow: none !important;
  border-color: inherit;
}
* {
  -webkit-tap-highlight-color: transparent;
}
/* PWA tab bar: ensure fixed sticks to visual viewport bottom */
[data-vitascan-tabbar="1"] {
  position: fixed !important;
  bottom: 0 !important;
  left: 0 !important;
  right: 0 !important;
  box-sizing: border-box !important;
}
`;
