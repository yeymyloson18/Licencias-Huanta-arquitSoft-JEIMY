// Modo de color antes del primer pintado (013, T049; plan B de research R-05, aprobado por la usuaria).
//
// Se carga en el <head> de index.html como script clásico externo (sin async ni defer), así corre
// antes de que el navegador pinte: con una elección guardada contraria al dispositivo, la página ya
// sale en el modo elegido, sin destello. Es un archivo propio del mismo origen, compatible con la CSP
// (script-src 'self'); no hay scripts en línea. Sin elección no hace nada: el CSS sigue a
// prefers-color-scheme. Debe coincidir con aplicarModoGuardado() de src/sesion/modo-color.ts.
(function () {
  try {
    var modo = window.localStorage.getItem('licencias-modo-color');
    if (modo === 'claro' || modo === 'oscuro') {
      document.documentElement.setAttribute(
        'data-coreui-theme',
        modo === 'oscuro' ? 'dark' : 'light',
      );
    }
  } catch (error) {
    // Sin almacenamiento (modo privado o bloqueado): vale el modo del dispositivo.
  }
})();
