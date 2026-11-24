"""Pruebas punta a punta de Margen con Gemini simulado (no gasta cupo ni necesita clave real).

Uso:
  python3 -m http.server 5174 &      (desde la raíz del proyecto)
  python3 tests/e2e/flujos.py

Variables: MARGEN_URL (por defecto http://localhost:5174/), CHROME (ruta a Chrome; opcional).
"""
import asyncio, json, os, re, subprocess, sys, tempfile
from playwright.async_api import async_playwright, expect
sys.stdout.reconfigure(encoding='utf-8')  # consolas de Windows (cp1252) no imprimen − ni ✓

URL = os.environ.get('MARGEN_URL', 'http://localhost:5174/')
CHROME = os.environ.get('CHROME')
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

PEDIDOS = []
CAPTURAS = os.environ.get('CAPTURAS')


async def captura(pg, nombre, **kw):
    if CAPTURAS:
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(CAPTURAS, nombre + '.png'), **kw)


def respuesta_gemini(datos):
    texto = datos if isinstance(datos, str) else json.dumps(datos, ensure_ascii=False)
    return {'candidates': [{'content': {'parts': [{'text': texto}]}, 'finishReason': 'STOP'}], 'usageMetadata': {'totalTokenCount': 1500}}


CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS'}


def simular(estado):
    async def manejar(route):
        req = route.request
        fulfill = route.fulfill

        async def responder(status=200, json=None):
            await fulfill(status=status, headers=CORS, json=json)
        route.fulfill = responder
        if req.method == 'OPTIONS':
            return await fulfill(status=204, headers=CORS)
        url = req.url
        if req.headers.get('x-goog-api-key') != 'clave-buena':
            return await route.fulfill(status=400, json={'error': {'code': 400, 'message': 'API key not valid. Please pass a valid API key.', 'details': [{'reason': 'API_KEY_INVALID'}]}})
        if req.method == 'GET' and '/models' in url:
            return await route.fulfill(json={'models': [
                {'name': 'models/gemini-3.6-flash', 'supportedGenerationMethods': ['generateContent']},
                {'name': 'models/gemini-3.8-flash', 'supportedGenerationMethods': ['generateContent']},
                {'name': 'models/gemini-embedding-2', 'supportedGenerationMethods': ['embedContent']},
            ]})
        cuerpo = json.loads(req.post_data or '{}')
        PEDIDOS.append({'url': url, 'cuerpo': cuerpo})
        cfg = cuerpo.get('generationConfig', {})
        # 1) La primera vez rechazamos el formato nuevo para probar el respaldo al formato anterior.
        if 'responseFormat' in cfg and not estado.get('formato_rechazado'):
            estado['formato_rechazado'] = True
            return await route.fulfill(status=400, json={'error': {'code': 400, 'message': 'Invalid JSON payload received. Unknown name "responseFormat" at generation_config.'}})
        # 2) Un 429 momentáneo para probar el reintento.
        if estado.get('forzar_429'):
            estado['forzar_429'] = False
            return await route.fulfill(status=429, json={'error': {'code': 429, 'message': 'Resource exhausted. Please retry.', 'details': [{'@type': 'type.googleapis.com/google.rpc.RetryInfo', 'retryDelay': '1s'}]}})
        partes = cuerpo['contents'][0]['parts']
        texto = ' '.join(p.get('text', '') for p in partes)
        if any('inlineData' in p for p in partes):
            return await route.fulfill(json=respuesta_gemini('Anexo. Cláusula quinta. Las mascotas están permitidas con autorización escrita del propietario.'))
        doc = re.search(r'<fuente doc="([^"]+)"', texto).group(1)
        if 'Analizá el documento completo' in texto:
            return await route.fulfill(json=respuesta_gemini({
                'titulo': 'Contrato de locación', 'tipo': 'contrato',
                'resumen': 'Es un contrato de alquiler por **veinticuatro meses** [1] con actualización semestral del precio [2]. También dice algo inventado [3].',
                'puntosClave': [{'texto': 'El depósito es de un mes de alquiler.', 'pagina': 2}, {'texto': 'Las expensas las paga el inquilino.', 'pagina': 2}],
                'citas': [
                    {'n': 1, 'doc': doc, 'pagina': 1, 'extracto': 'El plazo del contrato es de veinticuatro meses'},
                    {'n': 2, 'doc': doc, 'pagina': 1, 'extracto': 'El precio mensual se actualiza cada seis meses'},
                    {'n': 3, 'doc': doc, 'pagina': 7, 'extracto': 'texto en una página que no existe'},
                ],
                'temas': ['Alquiler', 'Plazos'], 'preguntasSugeridas': ['¿Quién paga las expensas?'],
            }))
        if 'Pregunta:' in texto:
            return await route.fulfill(json=respuesta_gemini({
                'respuesta': 'Las expensas ordinarias las paga el inquilino [1]. El contrato no dice nada de las extraordinarias [2].',
                'citas': [
                    {'n': 1, 'doc': doc, 'pagina': 2, 'extracto': 'Las expensas ordinarias están a cargo del inquilino'},
                    {'n': 2, 'doc': doc, 'pagina': 2, 'extracto': 'Las expensas extraordinarias las paga el propietario'},
                ],
                'encontrado': True, 'seguimiento': ['¿Cuánto es el depósito?'],
            }))
        return await route.fulfill(status=500, json={'error': {'code': 500, 'message': 'no simulado'}})
    return manejar


async def main():
    pdf = os.path.join(tempfile.gettempdir(), 'margen-contrato.pdf')
    subprocess.run(['node', os.path.join(RAIZ, 'tests/e2e/crear-pdf-prueba.mjs'), pdf], check=True, capture_output=True)
    estado = {}
    errores = []
    async with async_playwright() as p:
        navegador = await p.chromium.launch(executable_path=CHROME) if CHROME else await p.chromium.launch()
        ctx = await navegador.new_context(viewport={'width': 1366, 'height': 860}, accept_downloads=True)
        await ctx.route('https://generativelanguage.googleapis.com/**', simular(estado))
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errores.append(str(e)))

        # Ajustes: clave mala, después buena.
        await pg.goto(URL + '#/ajustes')
        await pg.fill('#clave', 'clave-mala')
        await pg.get_by_role('button', name='Guardar y probar').click()
        await expect(pg.locator('.estado-clave--error')).to_contain_text('no es válida')
        await pg.fill('#clave', 'clave-buena')
        await pg.get_by_role('button', name='Guardar y probar').click()
        await expect(pg.locator('.estado-clave--ok')).to_contain_text('gemini-3.8-flash')
        await expect(pg.locator('#modelo')).to_have_value('gemini-3.8-flash')
        print('ok  ajustes: valida la clave y elige el mejor modelo')

        # Subir el PDF.
        await pg.goto(URL + '#/')
        await pg.set_input_files('#archivo-pdf', pdf)
        await pg.wait_for_selector('.documento__titulo')
        await expect(pg.locator('.documento__titulo')).to_have_text('Contrato de locación de prueba')
        await expect(pg.locator('.aviso-fijo--escaneado')).to_contain_text('1 página no tiene')
        print('ok  importar: lee el PDF y detecta la página escaneada')

        # Leer la página escaneada con IA (imagen a Gemini).
        await pg.click('text=Leer la página con IA')
        await expect(pg.locator('.aviso-fijo--escaneado')).to_have_count(0, timeout=15000)
        assert any('inlineData' in json.dumps(x['cuerpo']) for x in PEDIDOS), 'no se envió la imagen'
        print('ok  OCR: manda la página como imagen y guarda el texto')

        # Resumen: prueba respaldo de formato y validación de citas.
        await pg.click('text=Resumir este documento')
        await pg.wait_for_selector('.resumen', timeout=15000)
        assert estado.get('formato_rechazado'), 'no se probó el formato nuevo'
        assert 'responseJsonSchema' in PEDIDOS[-1]['cuerpo']['generationConfig'], 'no usó el formato de respaldo'
        await expect(pg.locator('.resumen .cita')).to_have_count(2)  # la cita a la página 7 se descarta
        await expect(pg.locator('.resumen .nota__texto')).not_to_contain_text('[3]')
        await pg.click('.resumen .cita[data-cita="1"]')
        await expect(pg.locator('.textLayer mark.resaltado').first).to_be_visible(timeout=8000)
        print('ok  resumen: respaldo de formato, descarta citas inválidas y resalta en el PDF')

        # Pregunta con reintento por 429 y verificación de citas.
        estado['forzar_429'] = True
        await pg.click('#pestana-preguntas')
        await pg.fill('textarea', '¿Quién paga las expensas?')
        await pg.keyboard.press('Enter')
        await pg.wait_for_selector('.mensaje--margen', timeout=20000)
        await expect(pg.locator('.mensaje--margen .glosa--exacta')).to_have_count(1)
        await expect(pg.locator('.mensaje--margen .glosa--no-encontrada')).to_have_count(1)
        await expect(pg.locator('.mensaje--margen .cita--dudosa')).to_have_count(1)
        texto_contexto = PEDIDOS[-1]['cuerpo']['contents'][0]['parts'][0]['text']
        assert 'mascotas' in texto_contexto, 'el texto leído con IA no entró en el contexto'
        await captura(pg, 'preguntas-verificacion')
        print('ok  preguntas: reintenta tras 429 y marca la cita que no está en el texto')

        # Exportar.
        await pg.click('#pestana-resumen')
        async with pg.expect_download() as descarga:
            await pg.click('text=Exportar')
        ruta = await (await descarga.value).path()
        md = open(ruta, encoding='utf-8').read()
        assert md.startswith('# Contrato de locación') and '[^1]' in md
        print('ok  exportar: Markdown con notas al pie')

        # Preguntar a varios documentos (con el ejemplo).
        await pg.goto(URL + '#/')
        await pg.wait_for_selector('.lista-docs')
        await pg.evaluate("import('./js/servicio.js').then(m => m.cargarEjemplo())")
        await pg.goto(URL + '#/preguntar')
        await pg.wait_for_selector('.selector-docs')
        await pg.locator('.selector-docs input').nth(1).check()
        await expect(pg.locator('textarea')).to_have_attribute('placeholder', re.compile('estos 2 documentos'))
        await captura(pg, 'preguntar-varios')
        print('ok  preguntar: varios documentos a la vez')

        # Persistencia: recargar y seguir viendo todo.
        await pg.reload()
        await pg.goto(URL + '#/')
        await expect(pg.locator('.doc')).to_have_count(2)
        await expect(pg.locator('.sello--ok')).to_have_count(1)
        await captura(pg, 'biblioteca')
        print('ok  persistencia: documentos y resumen siguen después de recargar')

        # Borrar documento.
        pg.once('dialog', lambda d: d.accept())
        await pg.locator('.doc').first.locator('.boton-icono').click()
        await pg.click('dialog .boton--peligro')
        await expect(pg.locator('.doc')).to_have_count(1)
        print('ok  borrar: elimina el documento y sus datos')

        await navegador.close()

    if errores:
        print('Errores de la página:\n' + '\n'.join(errores))
        sys.exit(1)
    print('\nTodas las pruebas punta a punta pasaron.')


asyncio.run(main())
