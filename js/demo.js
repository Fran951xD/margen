// Resultados de ejemplo para probar Margen sin clave de Gemini.
// Todas las citas son textuales del documento de ejemplo (lo verifica tests/demo.test.js).
import { PAGINAS_EJEMPLO } from './demo-paginas.js';

const D = 'ejemplo';

export const DEMO = {
  documento: {
    titulo: 'Cómo estudiar mejor: lo que dice la evidencia',
    autor: 'Margen (documento de ejemplo)',
    nombreArchivo: 'ejemplo-como-estudiar-mejor.pdf',
    paginas: 5,
    paginasSinTexto: [],
    palabras: PAGINAS_EJEMPLO.reduce((s, p) => s + p.texto.split(/\s+/).length, 0),
    demo: true,
  },
  paginas: PAGINAS_EJEMPLO,

  analisis: {
    titulo: 'Cómo estudiar mejor: lo que dice la evidencia',
    tipo: 'apunte',
    resumen: [
      'La guía sostiene que las formas más comunes de estudiar (releer, subrayar y concentrar todo la noche anterior) dan sensación de dominio pero producen un aprendizaje que se olvida rápido [1]. Propone reemplazarlas por cuatro técnicas con respaldo experimental: práctica de recuperación, repetición espaciada, intercalado y elaboración [2].',
      'La idea que las une es que aprender consiste en practicar sacar la información de la memoria, no en volver a leerla [3]. Por eso destaca un estudio de 2006 en el que quienes practicaron recordar un texto lo retenían mucho mejor una semana después que quienes lo releyeron [4], y una revisión de 2013 que califica a releer y resaltar como técnicas de baja utilidad [5].',
      'Cierra con un plan semanal concreto, basado en sesiones cortas que empiezan recordando lo anterior y en repasos espaciados a uno, tres y siete días [6].',
    ].join('\n\n'),
    citas: [
      { n: 1, doc: D, pagina: 1, extracto: 'producen un aprendizaje frágil, que se olvida en pocos días', verificacion: 'exacta' },
      { n: 2, doc: D, pagina: 1, extracto: 'la práctica de recuperación, la repetición espaciada, el intercalado y la elaboración', verificacion: 'exacta' },
      { n: 3, doc: D, pagina: 1, extracto: 'aprender no es meter información en la memoria, sino practicar sacarla', verificacion: 'exacta' },
      { n: 4, doc: D, pagina: 2, extracto: 'una semana después, el grupo que practicó la recuperación recordaba bastante más que el otro', verificacion: 'exacta' },
      { n: 5, doc: D, pagina: 5, extracto: 'releer, subrayar y resaltar recibieron una calificación baja', verificacion: 'exacta' },
      { n: 6, doc: D, pagina: 5, extracto: 'programar repasos espaciados de cada tema a uno, tres y siete días', verificacion: 'exacta' },
    ],
    puntosClave: [
      { texto: 'Releer genera fluidez, y esa fluidez se confunde con aprendizaje real.', pagina: 2 },
      { texto: 'Recordar sin mirar el material (preguntas, tarjetas, hoja en blanco) fortalece el recuerdo más que releer.', pagina: 2 },
      { texto: 'Distribuir el estudio en varios días rinde más que concentrarlo en un solo bloque largo.', pagina: 3 },
      { texto: 'Los intervalos entre repasos deben crecer: un día, tres días, una semana, dos semanas.', pagina: 3 },
      { texto: 'El sistema de cajas de Leitner concentra el tiempo en las tarjetas que más cuestan.', pagina: 3 },
      { texto: 'Mezclar tipos de problemas entrena a reconocer qué estrategia usar, que es lo que se evalúa.', pagina: 4 },
      { texto: 'Explicar el tema en voz alta revela lo que todavía no se entiende.', pagina: 4 },
      { texto: 'Dormir bien consolida la memoria; estudiar de madrugada antes del examen suele ser contraproducente.', pagina: 5 },
    ],
    temas: ['Técnicas de estudio', 'Memoria', 'Repetición espaciada', 'Práctica de recuperación', 'Psicología cognitiva'],
    preguntasSugeridas: [
      '¿Por qué releer no funciona tan bien?',
      '¿Cada cuánto conviene repasar un tema?',
      '¿Qué es el intercalado?',
      '¿Cómo armo un plan de estudio semanal?',
    ],
    nivel: 'normal',
    modelo: 'demo',
    creado: Date.UTC(2026, 10, 16),
  },

  glosario: {
    terminos: [
      { termino: 'Cajas de Leitner', definicion: 'Sistema para organizar tarjetas de memoria: las que se aciertan pasan a cajas que se repasan con menos frecuencia y las que se fallan vuelven a la primera.', pagina: 3 },
      { termino: 'Curva del olvido', definicion: 'Descripción de Ebbinghaus de cómo, sin repaso, la mayor parte de lo aprendido se pierde en los primeros días.', pagina: 1 },
      { termino: 'Dificultades deseables', definicion: 'Esfuerzos de aprendizaje que cuestan un poco, como recordar sin mirar, y que por eso fortalecen el recuerdo.', pagina: 1 },
      { termino: 'Elaboración', definicion: 'Explicar por qué y cómo funcionan las cosas y conectar lo nuevo con lo que ya se sabe.', pagina: 4 },
      { termino: 'Fluidez', definicion: 'Sensación de facilidad al releer un material conocido, que suele confundirse con haberlo aprendido.', pagina: 2 },
      { termino: 'Intercalado', definicion: 'Mezclar distintos tipos de problemas o temas en una misma sesión en lugar de practicar uno solo por vez.', pagina: 4 },
      { termino: 'Práctica de recuperación', definicion: 'Intentar recordar la información sin mirar el material, con preguntas, tarjetas o escribiendo lo que se recuerda.', pagina: 2 },
      { termino: 'Práctica distribuida', definicion: 'Nombre técnico de repartir el estudio en varias sesiones separadas en el tiempo; la revisión de 2013 la califica de alta utilidad.', pagina: 5 },
      { termino: 'Repetición espaciada', definicion: 'Distribuir los repasos en el tiempo con intervalos que crecen a medida que el recuerdo se consolida.', pagina: 3 },
    ],
    modelo: 'demo',
    creado: Date.UTC(2026, 10, 16),
  },

  repaso: {
    preguntas: [
      { pregunta: 'En el estudio de Roediger y Karpicke, ¿qué grupo recordaba más una semana después?', opciones: ['El que releyó el texto varias veces', 'El que practicó recordar el texto', 'Ambos recordaban lo mismo', 'El que subrayó el texto'], correcta: 1, explicacion: 'A los cinco minutos ganaba la relectura, pero a la semana el grupo que practicó la recuperación recordaba bastante más.', pagina: 2 },
      { pregunta: '¿Qué intervalos de repaso propone la guía como ejemplo?', opciones: ['Cada hora durante un día', 'Solo la noche antes del examen', 'Al día siguiente, a los tres días, a la semana y a las dos semanas', 'Una vez por mes'], correcta: 2, explicacion: 'Los intervalos crecen a medida que el recuerdo se consolida.', pagina: 3 },
      { pregunta: '¿Por qué el intercalado ayuda en los exámenes?', opciones: ['Porque se practica más rápido', 'Porque obliga a identificar qué tipo de problema se tiene y qué estrategia corresponde', 'Porque da mejores resultados durante la práctica', 'Porque reduce la cantidad de ejercicios'], correcta: 1, explicacion: 'La habilidad de discriminar entre tipos de problemas es la que se evalúa.', pagina: 4 },
      { pregunta: 'Según la revisión de 2013, ¿qué técnica tiene baja utilidad por sí sola?', opciones: ['Práctica de recuperación', 'Práctica distribuida', 'Resaltar', 'Ninguna'], correcta: 2, explicacion: 'Releer, subrayar y resaltar recibieron una calificación baja.', pagina: 5 },
      { pregunta: '¿Qué pasa con las tarjetas que se responden mal en el sistema de Leitner?', opciones: ['Se descartan', 'Pasan a la última caja', 'Vuelven a la primera caja y se repasan pronto', 'Se repasan una vez por mes'], correcta: 2, explicacion: 'Así el tiempo se concentra en lo que más cuesta.', pagina: 3 },
      { pregunta: '¿Qué idea une a todas las técnicas de la guía?', opciones: ['Estudiar más horas', 'Aprender es practicar sacar la información de la memoria', 'Leer más rápido', 'Usar colores en los apuntes'], correcta: 1, explicacion: 'El esfuerzo de recordar es lo que fortalece el recuerdo.', pagina: 1 },
    ],
    tarjetas: [
      { frente: '¿Qué es la práctica de recuperación?', dorso: 'Intentar recordar la información sin mirar el material.', pagina: 2 },
      { frente: '¿Qué describe la curva del olvido?', dorso: 'Que sin repaso se pierde la mayor parte de lo aprendido en los primeros días.', pagina: 1 },
      { frente: '¿Por qué releer engaña?', dorso: 'Porque genera fluidez, y la fluidez se confunde con aprendizaje.', pagina: 2 },
      { frente: '¿Cuándo conviene repasar algo?', dorso: 'Justo cuando está por olvidarse, no cuando todavía está fresco.', pagina: 3 },
      { frente: '¿Qué es la elaboración?', dorso: 'Explicar por qué y cómo funcionan las cosas y conectarlas con lo que ya se sabe.', pagina: 4 },
      { frente: '¿Qué aporta explicar en voz alta?', dorso: 'Muestra los huecos: lo que todavía no se entiende.', pagina: 4 },
      { frente: '¿Cuánto debería durar un bloque de estudio?', dorso: 'Entre 25 y 40 minutos, cerrando con preguntas o tarjetas.', pagina: 5 },
      { frente: '¿Por qué importa el sueño?', dorso: 'Durante el descanso nocturno la memoria consolida lo aprendido.', pagina: 5 },
    ],
  },

  respuestas: [
    {
      pregunta: '¿Por qué releer no funciona tan bien?',
      respuesta: {
        texto: 'Porque releer da una **sensación de dominio** que no se corresponde con lo que realmente se aprende [1]. Al volver sobre un texto conocido aparece fluidez, y esa fluidez se confunde con aprendizaje [2].\n\nEl estudio de 2006 que cita la guía lo muestra: a los cinco minutos, quienes releyeron recordaban un poco más, pero una semana después recordaban mucho menos que quienes practicaron recordar sin mirar [3]. La revisión de 2013 llega a la misma conclusión y califica la relectura como de baja utilidad [4].',
        citas: [
          { n: 1, doc: D, pagina: 1, extracto: 'Esas estrategias dan una sensación de dominio', verificacion: 'exacta' },
          { n: 2, doc: D, pagina: 2, extracto: 'Releer genera fluidez, y la fluidez se confunde con aprendizaje', verificacion: 'exacta' },
          { n: 3, doc: D, pagina: 2, extracto: 'A los cinco minutos, el grupo que releyó recordaba un poco más', verificacion: 'exacta' },
          { n: 4, doc: D, pagina: 5, extracto: 'releer, subrayar y resaltar recibieron una calificación baja', verificacion: 'exacta' },
        ],
        encontrado: true,
        seguimiento: ['¿Qué hago en lugar de releer?', '¿Cada cuánto conviene repasar un tema?'],
      },
    },
    {
      pregunta: '¿Cada cuánto conviene repasar un tema?',
      respuesta: {
        texto: 'Con intervalos que **van creciendo**: la guía propone repasar al día siguiente, a los tres días, a la semana y a las dos semanas [1]. La lógica es repasar justo cuando algo está por olvidarse, que rinde más que hacerlo cuando todavía está fresco [2].\n\nEn el plan semanal lo resume en repasos de cada tema a uno, tres y siete días [3], y recomienda que cada repaso sea un intento de recordar y no una relectura [4].',
        citas: [
          { n: 1, doc: D, pagina: 3, extracto: 'repasar al día siguiente, luego a los tres días, a la semana y a las dos semanas', verificacion: 'exacta' },
          { n: 2, doc: D, pagina: 3, extracto: 'Repasar justo cuando algo está por olvidarse es más eficiente que repasar cuando todavía está fresco', verificacion: 'exacta' },
          { n: 3, doc: D, pagina: 5, extracto: 'programar repasos espaciados de cada tema a uno, tres y siete días', verificacion: 'exacta' },
          { n: 4, doc: D, pagina: 3, extracto: 'cada repaso espaciado debería ser un intento de recordar, no una relectura', verificacion: 'exacta' },
        ],
        encontrado: true,
        seguimiento: ['¿Qué son las cajas de Leitner?', '¿Cómo armo un plan de estudio semanal?'],
      },
    },
    {
      pregunta: '¿Qué es el intercalado?',
      respuesta: {
        texto: 'Es **mezclar distintos tipos de problemas o temas** en una misma sesión, en lugar de practicar uno solo hasta dominarlo [1]. Por ejemplo, en matemática, resolver ejercicios de áreas de distintas figuras mezclados [2].\n\nDurante la práctica parece rendir menos que estudiar en bloques, pero obliga a reconocer qué tipo de problema se tiene delante y qué estrategia aplicar [3], que es justamente lo que se evalúa en un examen.',
        citas: [
          { n: 1, doc: D, pagina: 4, extracto: 'mezclar distintos tipos de problemas o temas dentro de una misma sesión', verificacion: 'exacta' },
          { n: 2, doc: D, pagina: 4, extracto: 'resolver ejercicios de áreas de distintas figuras mezclados', verificacion: 'exacta' },
          { n: 3, doc: D, pagina: 4, extracto: 'obliga a identificar qué tipo de problema se tiene delante y qué estrategia corresponde', verificacion: 'exacta' },
        ],
        encontrado: true,
        seguimiento: ['¿Qué es la elaboración?', '¿Por qué releer no funciona tan bien?'],
      },
    },
    {
      pregunta: '¿Cómo armo un plan de estudio semanal?',
      respuesta: {
        texto: 'La guía propone cuatro hábitos para cada semana [1]:\n\n- Empezar cada sesión recordando lo visto antes, sin mirar.\n- Estudiar el tema nuevo en bloques de 25 a 40 minutos.\n- Cerrar cada bloque con preguntas o tarjetas.\n- Programar repasos de cada tema a uno, tres y siete días.\n\nAgrega que conviene **no sacrificar el sueño**, porque durante el descanso la memoria consolida lo aprendido [2].',
        citas: [
          { n: 1, doc: D, pagina: 5, extracto: 'dedicar los primeros minutos de cada sesión a recordar lo visto antes, sin mirar', verificacion: 'exacta' },
          { n: 2, doc: D, pagina: 5, extracto: 'Durante el descanso nocturno la memoria consolida lo aprendido', verificacion: 'exacta' },
        ],
        encontrado: true,
        seguimiento: ['¿Cada cuánto conviene repasar un tema?', '¿Qué es el intercalado?'],
      },
    },
  ],
};
