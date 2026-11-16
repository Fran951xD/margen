// Cliente mínimo de la API de Gemini, directo desde el navegador con la clave de la persona.
import { ordenarModelos, INSTRUCCION_SISTEMA } from './logica.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const MODELOS_RESPALDO = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'];

export class ErrorGemini extends Error {
  constructor(mensaje, { tipo = 'desconocido', estado = 0, espera = 0, detalle = '' } = {}) {
    super(mensaje);
    Object.assign(this, { tipo, estado, espera, detalle });
  }
}

const esperar = (ms, senal) => new Promise((ok, mal) => {
  const t = setTimeout(ok, ms);
  senal?.addEventListener('abort', () => { clearTimeout(t); mal(new DOMException('Cancelado', 'AbortError')); }, { once: true });
});

async function pedir(ruta, clave, { metodo = 'GET', cuerpo, senal } = {}) {
  let r;
  try {
    r = await fetch(`${BASE}/${ruta}`, {
      method: metodo,
      headers: { 'x-goog-api-key': clave, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: senal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ErrorGemini('No hay conexión con Google. Revisá tu internet y probá de nuevo.', { tipo: 'red' });
  }
  const texto = await r.text();
  let datos = {};
  try { datos = texto ? JSON.parse(texto) : {}; } catch { datos = { error: { message: texto } }; }
  if (!r.ok) throw traducirError(r.status, datos.error || {});
  return datos;
}

function traducirError(estado, error) {
  const mensaje = String(error.message || '');
  const razon = (error.details || []).map((d) => d.reason).find(Boolean) || '';
  const retry = (error.details || []).find((d) => d.retryDelay)?.retryDelay;
  const espera = retry ? Math.ceil(parseFloat(retry) * 1000) : 0;
  if (razon === 'API_KEY_INVALID' || /api key not valid|API_KEY_INVALID/i.test(mensaje)) {
    return new ErrorGemini('La clave de Gemini no es válida. Copiala de nuevo desde Google AI Studio.', { tipo: 'clave', estado, detalle: mensaje });
  }
  if (estado === 403) return new ErrorGemini('Esta clave no tiene permiso para usar Gemini. Revisá que la API esté habilitada en tu proyecto.', { tipo: 'permiso', estado, detalle: mensaje });
  if (estado === 404) return new ErrorGemini('Ese modelo no está disponible para tu clave.', { tipo: 'modelo', estado, detalle: mensaje });
  if (estado === 429) {
    const diario = /per.?day|PerDay|daily/i.test(mensaje);
    return new ErrorGemini(diario
      ? 'Llegaste al límite diario gratuito de Gemini. Se renueva cada día; mientras tanto podés elegir otro modelo en Ajustes.'
      : 'Gemini recibió muchas consultas seguidas. Esperá unos segundos y probá de nuevo.', { tipo: diario ? 'cupo-diario' : 'cupo', estado, espera, detalle: mensaje });
  }
  if (estado === 400 && /responseFormat|response_format|Unknown name|Invalid JSON payload/i.test(mensaje)) {
    return new ErrorGemini('Formato de pedido no soportado.', { tipo: 'formato', estado, detalle: mensaje });
  }
  if (estado === 400 && /token|too long|exceeds/i.test(mensaje)) {
    return new ErrorGemini('El texto es demasiado largo para este modelo. Probá con menos documentos a la vez.', { tipo: 'largo', estado, detalle: mensaje });
  }
  if (estado >= 500) return new ErrorGemini('Gemini no está respondiendo ahora. Probá de nuevo en un minuto.', { tipo: 'servidor', estado, detalle: mensaje });
  return new ErrorGemini(mensaje || `Error ${estado} de Gemini.`, { tipo: 'desconocido', estado, detalle: mensaje });
}

/** Modelos de texto disponibles para esta clave, del más recomendado al menos. */
export async function listarModelos(clave, senal) {
  const nombres = [];
  let token = '';
  do {
    const datos = await pedir(`models?pageSize=200${token ? `&pageToken=${token}` : ''}`, clave, { senal });
    for (const m of datos.models || []) {
      if ((m.supportedGenerationMethods || ['generateContent']).includes('generateContent')) nombres.push(String(m.name).replace(/^models\//, ''));
    }
    token = datos.nextPageToken || '';
  } while (token);
  return ordenarModelos(nombres);
}

let formatoLegado = false; // se activa solo si la API rechaza responseFormat

function configuracion(esquema, temperatura) {
  const base = { temperature: temperatura };
  if (!esquema) return base;
  return formatoLegado
    ? { ...base, responseMimeType: 'application/json', responseJsonSchema: esquema }
    : { ...base, responseFormat: { text: { mimeType: 'application/json', schema: esquema } } };
}

export function leerJson(texto) {
  const limpio = String(texto ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(limpio); } catch {
    const i = limpio.indexOf('{'); const j = limpio.lastIndexOf('}');
    if (i > -1 && j > i) { try { return JSON.parse(limpio.slice(i, j + 1)); } catch { /* sigue abajo */ } }
    throw new ErrorGemini('Gemini devolvió una respuesta incompleta. Probá de nuevo.', { tipo: 'json' });
  }
}

/**
 * Genera contenido. `partes` es una lista de partes de Gemini ({ text } o { inlineData }).
 * Reintenta los cortes momentáneos y, si el modelo no existe o se agota, prueba con el siguiente.
 */
export async function generar({ clave, modelos, partes, esquema, temperatura = 0.3, senal, alAvisar }) {
  const lista = [...new Set(modelos.filter(Boolean))];
  let ultimo;
  for (const modelo of lista) {
    for (let intento = 0; intento < 3; intento++) {
      try {
        const datos = await pedir(`models/${encodeURIComponent(modelo)}:generateContent`, clave, {
          metodo: 'POST',
          senal,
          cuerpo: {
            systemInstruction: { parts: [{ text: INSTRUCCION_SISTEMA }] },
            contents: [{ role: 'user', parts: partes }],
            generationConfig: configuracion(esquema, temperatura),
          },
        });
        const candidato = datos.candidates?.[0];
        if (!candidato) {
          const motivo = datos.promptFeedback?.blockReason;
          throw new ErrorGemini(motivo ? 'Gemini no quiso procesar este contenido.' : 'Gemini no devolvió respuesta.', { tipo: 'bloqueo' });
        }
        const texto = (candidato.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
        if (!texto && candidato.finishReason && candidato.finishReason !== 'STOP') {
          throw new ErrorGemini(candidato.finishReason === 'MAX_TOKENS'
            ? 'La respuesta quedó cortada por largo. Probá con un nivel de detalle menor.'
            : 'Gemini cortó la respuesta por sus filtros de seguridad.', { tipo: 'corte' });
        }
        return { datos: esquema ? leerJson(texto) : texto, modelo, uso: datos.usageMetadata || {} };
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        ultimo = e;
        if (e.tipo === 'formato' && !formatoLegado) { formatoLegado = true; intento--; continue; }
        if (e.tipo === 'clave' || e.tipo === 'permiso' || e.tipo === 'largo' || e.tipo === 'bloqueo') throw e;
        if (e.tipo === 'modelo' || e.tipo === 'cupo-diario') break; // siguiente modelo
        if ((e.tipo === 'cupo' || e.tipo === 'servidor' || e.tipo === 'red' || e.tipo === 'json') && intento < 2) {
          const ms = Math.min(e.espera || 2000 * 2 ** intento, 30000);
          alAvisar?.(`Gemini está ocupado; reintento en ${Math.ceil(ms / 1000)} s…`);
          await esperar(ms, senal);
          continue;
        }
        break;
      }
    }
    if (lista.indexOf(modelo) < lista.length - 1) alAvisar?.('Probando con otro modelo…');
  }
  throw ultimo || new ErrorGemini('No se pudo completar el pedido.');
}

/** Prueba la clave con un pedido mínimo. Devuelve los modelos disponibles. */
export async function probarClave(clave) {
  const modelos = await listarModelos(clave);
  if (!modelos.length) throw new ErrorGemini('La clave funciona, pero no tiene modelos de texto disponibles.', { tipo: 'modelo' });
  return modelos;
}
