/*
 * Runtime conjugation for the vocab drill (Spanish + German), offline.
 *
 * Loaded by drill.html as a plain <script> (exposes window.VocabConjugate) and
 * require()-able from node for tests. Regular verbs are derived by rule; common
 * irregular verbs come from the tables below. Verbs we don't recognise fall back
 * to regular forms — acceptable for a study aid, but not authoritative for every
 * irregular. Returns null for anything that isn't a single infinitive (phrases
 * are shown as examples only).
 *
 * API: conjugate(verb, "es"|"de") -> {
 *   lang, infinitive, persons: [...],
 *   tenses: [{ name, forms: [...] }, ...],
 *   imperative?: { tu, vosotros, usted, ustedes } | { du, ihr, sie },
 *   note: string,
 * } | null
 */
(function (global) {
  "use strict";

  // ------------------------------------------------------------------ Spanish
  const ES_PERSONS = ["yo", "tú", "él/ella/usted", "nosotros", "vosotros", "ellos/ellas/ustedes"];

  // Present-tense irregular forms (full six).
  const ES_PRESENT_IRREG = {
    ser: ["soy", "eres", "es", "somos", "sois", "son"],
    estar: ["estoy", "estás", "está", "estamos", "estáis", "están"],
    ir: ["voy", "vas", "va", "vamos", "vais", "van"],
    haber: ["he", "has", "ha", "hemos", "habéis", "han"],
    tener: ["tengo", "tienes", "tiene", "tenemos", "tenéis", "tienen"],
    hacer: ["hago", "haces", "hace", "hacemos", "hacéis", "hacen"],
    poder: ["puedo", "puedes", "puede", "podemos", "podéis", "pueden"],
    poner: ["pongo", "pones", "pone", "ponemos", "ponéis", "ponen"],
    saber: ["sé", "sabes", "sabe", "sabemos", "sabéis", "saben"],
    venir: ["vengo", "vienes", "viene", "venimos", "venís", "vienen"],
    querer: ["quiero", "quieres", "quiere", "queremos", "queréis", "quieren"],
    decir: ["digo", "dices", "dice", "decimos", "decís", "dicen"],
    oír: ["oigo", "oyes", "oye", "oímos", "oís", "oyen"],
    ver: ["veo", "ves", "ve", "vemos", "veis", "ven"],
    dar: ["doy", "das", "da", "damos", "dais", "dan"],
    salir: ["salgo", "sales", "sale", "salimos", "salís", "salen"],
    conocer: ["conozco", "conoces", "conoce", "conocemos", "conocéis", "conocen"],
    traer: ["traigo", "traes", "trae", "traemos", "traéis", "traen"],
    conducir: ["conduzco", "conduces", "conduce", "conducimos", "conducís", "conducen"],
    jugar: ["juego", "juegas", "juega", "jugamos", "jugáis", "juegan"],
    dormir: ["duermo", "duermes", "duerme", "dormimos", "dormís", "duermen"],
    pedir: ["pido", "pides", "pide", "pedimos", "pedís", "piden"],
    empezar: ["empiezo", "empiezas", "empieza", "empezamos", "empezáis", "empiezan"],
    volver: ["vuelvo", "vuelves", "vuelve", "volvemos", "volvéis", "vuelven"],
    pensar: ["pienso", "piensas", "piensa", "pensamos", "pensáis", "piensan"],
    entender: ["entiendo", "entiendes", "entiende", "entendemos", "entendéis", "entienden"],
    preferir: ["prefiero", "prefieres", "prefiere", "preferimos", "preferís", "prefieren"],
    encontrar: ["encuentro", "encuentras", "encuentra", "encontramos", "encontráis", "encuentran"],
    recordar: ["recuerdo", "recuerdas", "recuerda", "recordamos", "recordáis", "recuerdan"],
    costar: ["cuesto", "cuestas", "cuesta", "costamos", "costáis", "cuestan"],
    mostrar: ["muestro", "muestras", "muestra", "mostramos", "mostráis", "muestran"],
    probar: ["pruebo", "pruebas", "prueba", "probamos", "probáis", "prueban"],
    cerrar: ["cierro", "cierras", "cierra", "cerramos", "cerráis", "cierran"],
    perder: ["pierdo", "pierdes", "pierde", "perdemos", "perdéis", "pierden"],
    sentir: ["siento", "sientes", "siente", "sentimos", "sentís", "sienten"],
    mentir: ["miento", "mientes", "miente", "mentimos", "mentís", "mienten"],
    repetir: ["repito", "repites", "repite", "repetimos", "repetís", "repiten"],
    servir: ["sirvo", "sirves", "sirve", "servimos", "servís", "sirven"],
    vestir: ["visto", "vistes", "viste", "vestimos", "vestís", "visten"],
    reír: ["río", "ríes", "ríe", "reímos", "reís", "ríen"],
    seguir: ["sigo", "sigues", "sigue", "seguimos", "seguís", "siguen"],
  };

  // Preterite irregular (full six).
  const ES_PRET_IRREG = {
    ser: ["fui", "fuiste", "fue", "fuimos", "fuisteis", "fueron"],
    ir: ["fui", "fuiste", "fue", "fuimos", "fuisteis", "fueron"],
    dar: ["di", "diste", "dio", "dimos", "disteis", "dieron"],
    ver: ["vi", "viste", "vio", "vimos", "visteis", "vieron"],
    tener: ["tuve", "tuviste", "tuvo", "tuvimos", "tuvisteis", "tuvieron"],
    estar: ["estuve", "estuviste", "estuvo", "estuvimos", "estuvisteis", "estuvieron"],
    poder: ["pude", "pudiste", "pudo", "pudimos", "pudisteis", "pudieron"],
    poner: ["puse", "pusiste", "puso", "pusimos", "pusisteis", "pusieron"],
    saber: ["supe", "supiste", "supo", "supimos", "supisteis", "supieron"],
    hacer: ["hice", "hiciste", "hizo", "hicimos", "hicisteis", "hicieron"],
    venir: ["vine", "viniste", "vino", "vinimos", "vinisteis", "vinieron"],
    querer: ["quise", "quisiste", "quiso", "quisimos", "quisisteis", "quisieron"],
    decir: ["dije", "dijiste", "dijo", "dijimos", "dijisteis", "dijeron"],
    traer: ["traje", "trajiste", "trajo", "trajimos", "trajisteis", "trajeron"],
    conducir: ["conduje", "condujiste", "condujo", "condujimos", "condujisteis", "condujeron"],
    haber: ["hube", "hubiste", "hubo", "hubimos", "hubisteis", "hubieron"],
  };

  const ES_IMPERFECT_IRREG = {
    ser: ["era", "eras", "era", "éramos", "erais", "eran"],
    ir: ["iba", "ibas", "iba", "íbamos", "ibais", "iban"],
    ver: ["veía", "veías", "veía", "veíamos", "veíais", "veían"],
  };

  const ES_FUTURE_STEM = {
    tener: "tendr", poder: "podr", poner: "pondr", saber: "sabr", hacer: "har",
    decir: "dir", venir: "vendr", querer: "querr", salir: "saldr", haber: "habr",
    caber: "cabr", valer: "valdr",
  };

  const ES_PARTICIPLE_IRREG = {
    hacer: "hecho", decir: "dicho", ver: "visto", poner: "puesto", escribir: "escrito",
    abrir: "abierto", romper: "roto", volver: "vuelto", devolver: "devuelto",
    morir: "muerto", cubrir: "cubierto", freír: "frito", imprimir: "impreso",
  };

  const ES_GERUND_IRREG = {
    ir: "yendo", leer: "leyendo", oír: "oyendo", traer: "trayendo",
    decir: "diciendo", venir: "viniendo", poder: "pudiendo", dormir: "durmiendo",
    pedir: "pidiendo", servir: "sirviendo", seguir: "siguiendo", reír: "riendo",
  };

  // Stem-changing verbs (present + subjunctive; preterite 3rd for -ir).
  const ES_STEM = {
    pensar: ["e", "ie"], entender: ["e", "ie"], empezar: ["e", "ie"],
    cerrar: ["e", "ie"], perder: ["e", "ie"], sentir: ["e", "ie"], mentir: ["e", "ie"],
    preferir: ["e", "ie"], querer: ["e", "ie"], venir: ["e", "ie"],
    poder: ["o", "ue"], volver: ["o", "ue"], encontrar: ["o", "ue"],
    recordar: ["o", "ue"], costar: ["o", "ue"], mostrar: ["o", "ue"],
    probar: ["o", "ue"], dormir: ["o", "ue"],
    pedir: ["e", "i"], repetir: ["e", "i"], servir: ["e", "i"], vestir: ["e", "i"],
    seguir: ["e", "i"], reír: ["e", "i"],
    jugar: ["u", "ue"],
  };

  const ES_IMP_TU_IRREG = {
    tener: "ten", poner: "pon", salir: "sal", hacer: "haz", ir: "ve", ser: "sé",
    decir: "di", venir: "ven", dar: "da", estar: "está", saber: "sabe", ver: "ve",
  };

  function esParts(verb) {
    if (!verb) return null;
    const v = verb.trim().toLowerCase();
    if (v.endsWith("ar")) return { type: "ar", stem: v.slice(0, -2) };
    if (v.endsWith("er")) return { type: "er", stem: v.slice(0, -2) };
    if (v.endsWith("ir")) return { type: "ir", stem: v.slice(0, -2) };
    return null;
  }

  function replaceLast(s, from, to) {
    const i = s.lastIndexOf(from);
    return i < 0 ? s : s.slice(0, i) + to + s.slice(i + from.length);
  }

  function esPresent(verb) {
    if (ES_PRESENT_IRREG[verb]) return ES_PRESENT_IRREG[verb].slice();
    const p = esParts(verb);
    if (!p) return null;
    const end = p.type === "ar" ? ["o", "as", "a", "amos", "áis", "an"]
      : p.type === "er" ? ["o", "es", "e", "emos", "éis", "en"]
      : ["o", "es", "e", "imos", "ís", "en"];
    const sc = ES_STEM[verb];
    return end.map((e, i) => {
      let s = p.stem;
      if (sc && i !== 3 && i !== 4) s = replaceLast(s, sc[0], sc[1]);
      return s + e;
    });
  }

  function esPreterite(verb) {
    if (ES_PRET_IRREG[verb]) return ES_PRET_IRREG[verb].slice();
    const p = esParts(verb);
    if (!p) return null;
    const end = p.type === "ar"
      ? ["é", "aste", "ó", "amos", "asteis", "aron"]
      : ["í", "iste", "ió", "imos", "isteis", "ieron"];
    const sc = ES_STEM[verb];
    return end.map((e, i) => {
      let s = p.stem;
      // -ir e→i / o→u only affects the 3rd persons (pidió/pidieron, durmió/durmieron)
      if (sc && p.type === "ir" && (i === 2 || i === 5)) {
        const to = sc[1] === "ie" ? "i" : sc[1] === "ue" ? "u" : sc[1];
        s = replaceLast(s, sc[0], to);
      }
      return s + e;
    });
  }

  function esImperfect(verb) {
    if (ES_IMPERFECT_IRREG[verb]) return ES_IMPERFECT_IRREG[verb].slice();
    const p = esParts(verb);
    if (!p) return null;
    return p.type === "ar"
      ? ["aba", "abas", "aba", "ábamos", "abais", "aban"].map((e) => p.stem + e)
      : ["ía", "ías", "ía", "íamos", "íais", "ían"].map((e) => p.stem + e);
  }

  function esFuture(verb) {
    const p = esParts(verb);
    if (!p) return null;
    const stem = ES_FUTURE_STEM[verb] || verb;
    return ["é", "ás", "á", "emos", "éis", "án"].map((e) => stem + e);
  }

  function esConditional(verb) {
    const p = esParts(verb);
    if (!p) return null;
    const stem = ES_FUTURE_STEM[verb] || verb;
    return ["ía", "ías", "ía", "íamos", "íais", "ían"].map((e) => stem + e);
  }

  function esSubjunctive(verb) {
    const pres = esPresent(verb);
    const p = esParts(verb);
    if (!pres || !p) return null;
    const yo = pres[0].endsWith("o") ? pres[0].slice(0, -1) : pres[0];
    const end = p.type === "ar" ? ["e", "es", "e", "emos", "éis", "en"]
      : ["a", "as", "a", "amos", "áis", "an"];
    const sc = ES_STEM[verb];
    return end.map((e, i) => {
      let s = yo;
      // -ar/-er stem changers keep the original stem in nosotros/vosotros;
      // -ir verbs keep the changed stem there.
      if (sc && p.type !== "ir" && (i === 3 || i === 4)) s = p.stem;
      return s + e;
    });
  }

  function esParticiple(verb) {
    if (ES_PARTICIPLE_IRREG[verb]) return ES_PARTICIPLE_IRREG[verb];
    const p = esParts(verb);
    if (!p) return null;
    return p.type === "ar" ? p.stem + "ado" : p.stem + "ido";
  }

  function esGerund(verb) {
    if (ES_GERUND_IRREG[verb]) return ES_GERUND_IRREG[verb];
    const p = esParts(verb);
    if (!p) return null;
    if (p.type === "ar") return p.stem + "ando";
    return p.stem + "iendo";
  }

  function esImperative(verb) {
    const pres = esPresent(verb);
    const subj = esSubjunctive(verb);
    const p = esParts(verb);
    if (!pres || !subj || !p) return null;
    const tu = ES_IMP_TU_IRREG[verb] || pres[2];
    const vos = p.type === "ar" ? p.stem + "ad" : p.type === "er" ? p.stem + "ed" : p.stem + "id";
    return { tu, vosotros: vos, usted: subj[2], ustedes: subj[5] };
  }

  function esConjugate(verb) {
    const v = (verb || "").trim().toLowerCase();
    if (!esParts(v)) return null;
    const tenses = [
      ["Presente", esPresent(v)],
      ["Pretérito", esPreterite(v)],
      ["Imperfecto", esImperfect(v)],
      ["Futuro", esFuture(v)],
      ["Condicional", esConditional(v)],
      ["Subjuntivo", esSubjunctive(v)],
    ].filter((t) => t[1]).map(([name, forms]) => ({ name, forms }));
    const ger = esGerund(v);
    const part = esParticiple(v);
    return {
      lang: "es",
      infinitive: v,
      persons: ES_PERSONS,
      tenses,
      nonFinite: [
        ger ? { name: "Gerundio", form: ger } : null,
        part ? { name: "Participio", form: part } : null,
      ].filter(Boolean),
      imperative: esImperative(v),
      note: "",
    };
  }

  // ------------------------------------------------------------------- German
  const DE_PERSONS = ["ich", "du", "er/sie/es", "wir", "ihr", "sie/Sie"];

  const DE_SEP = [
    "zurück", "zusammen", "vorbei", "voraus", "entlang", "gegenüber",
    "an", "auf", "aus", "bei", "ein", "fest", "her", "hin", "los", "mit",
    "nach", "vor", "weg", "zu", "ab", "um", "wieder", "weiter", "frei",
    "hoch", "runter", "raus", "rein",
  ].sort((a, b) => b.length - a.length);

  // Strong/mixed verbs: präteritum (ich), partizip II, auxiliary, present du/er,
  // optional konjunktiv-II stem.
  const DE_STRONG = {
    sein: { pret: "war", part: "gewesen", aux: "sein", du: "bist", er: "ist", k2: "wär",
      presFull: ["bin", "bist", "ist", "sind", "seid", "sind"], imp: "sei" },
    haben: { pret: "hatte", part: "gehabt", aux: "haben", du: "hast", er: "hat", k2: "hätt",
      presFull: ["habe", "hast", "hat", "haben", "habt", "haben"], imp: "hab" },
    werden: { pret: "wurde", part: "geworden", aux: "sein", du: "wirst", er: "wird", k2: "würd",
      presFull: ["werde", "wirst", "wird", "werden", "werdet", "werden"], imp: "werd" },
    gehen: { pret: "ging", part: "gegangen", aux: "sein" },
    kommen: { pret: "kam", part: "gekommen", aux: "sein" },
    sehen: { pret: "sah", part: "gesehen", aux: "haben", du: "siehst", er: "sieht", imp: "sieh" },
    essen: { pret: "aß", part: "gegessen", aux: "haben", du: "isst", er: "isst", imp: "iss" },
    trinken: { pret: "trank", part: "getrunken", aux: "haben" },
    sprechen: { pret: "sprach", part: "gesprochen", aux: "haben", du: "sprichst", er: "spricht", imp: "sprich" },
    fahren: { pret: "fuhr", part: "gefahren", aux: "sein", du: "fährst", er: "fährt", imp: "fahr" },
    lesen: { pret: "las", part: "gelesen", aux: "haben", du: "liest", er: "liest", imp: "lies" },
    schreiben: { pret: "schrieb", part: "geschrieben", aux: "haben" },
    nehmen: { pret: "nahm", part: "genommen", aux: "haben", du: "nimmst", er: "nimmt", imp: "nimm" },
    geben: { pret: "gab", part: "gegeben", aux: "haben", du: "gibst", er: "gibt", imp: "gib" },
    finden: { pret: "fand", part: "gefunden", aux: "haben" },
    bleiben: { pret: "blieb", part: "geblieben", aux: "sein" },
    schlafen: { pret: "schlief", part: "geschlafen", aux: "haben", du: "schläfst", er: "schläft" },
    laufen: { pret: "lief", part: "gelaufen", aux: "sein", du: "läufst", er: "läuft" },
    tragen: { pret: "trug", part: "getragen", aux: "haben", du: "trägst", er: "trägt" },
    wissen: { pret: "wusste", part: "gewusst", aux: "haben", du: "weißt", er: "weiß", k2: "wüsst",
      presFull: ["weiß", "weißt", "weiß", "wissen", "wisst", "wissen"], imp: "wiss" },
    tun: { pret: "tat", part: "getan", aux: "haben", du: "tust", er: "tut", k2: "tät",
      presFull: ["tue", "tust", "tut", "tun", "tut", "tun"], imp: "tu" },
    bringen: { pret: "brachte", part: "gebracht", aux: "haben" },
    denken: { pret: "dachte", part: "gedacht", aux: "haben" },
    kennen: { pret: "kannte", part: "gekannt", aux: "haben" },
    nennen: { pret: "nannte", part: "genannt", aux: "haben" },
    rennen: { pret: "rannte", part: "gerannt", aux: "sein" },
    können: { pret: "konnte", part: "gekonnt", aux: "haben", du: "kannst", er: "kann", k2: "könnt",
      presFull: ["kann", "kannst", "kann", "können", "könnt", "können"] },
    müssen: { pret: "musste", part: "gemusst", aux: "haben", du: "musst", er: "muss", k2: "müsst",
      presFull: ["muss", "musst", "muss", "müssen", "müsst", "müssen"] },
    wollen: { pret: "wollte", part: "gewollt", aux: "haben", du: "willst", er: "will", k2: "wollt",
      presFull: ["will", "willst", "will", "wollen", "wollt", "wollen"] },
    sollen: { pret: "sollte", part: "gesollt", aux: "haben", du: "sollst", er: "soll", k2: "sollt",
      presFull: ["soll", "sollst", "soll", "sollen", "sollt", "sollen"] },
    dürfen: { pret: "durfte", part: "gedurft", aux: "haben", du: "darfst", er: "darf", k2: "dürft",
      presFull: ["darf", "darfst", "darf", "dürfen", "dürft", "dürfen"] },
    mögen: { pret: "mochte", part: "gemocht", aux: "haben", du: "magst", er: "mag", k2: "möcht",
      presFull: ["mag", "magst", "mag", "mögen", "mögt", "mögen"] },
    stehen: { pret: "stand", part: "gestanden", aux: "haben" },
    verstehen: { pret: "verstand", part: "verstanden", aux: "haben" },
    halten: { pret: "hielt", part: "gehalten", aux: "haben", du: "hältst", er: "hält" },
    lassen: { pret: "ließ", part: "gelassen", aux: "haben", du: "lässt", er: "lässt" },
    rufen: { pret: "rief", part: "gerufen", aux: "haben" },
    ziehen: { pret: "zog", part: "gezogen", aux: "haben" },
    fliegen: { pret: "flog", part: "geflogen", aux: "sein" },
    werfen: { pret: "warf", part: "geworfen", aux: "haben", du: "wirfst", er: "wirft", imp: "wirf" },
    helfen: { pret: "half", part: "geholfen", aux: "haben", du: "hilfst", er: "hilft", imp: "hilf" },
    sterben: { pret: "starb", part: "gestorben", aux: "sein", du: "stirbst", er: "stirbt" },
    vergessen: { pret: "vergaß", part: "vergessen", aux: "haben", du: "vergisst", er: "vergisst", imp: "vergiss" },
    gewinnen: { pret: "gewann", part: "gewonnen", aux: "haben" },
    beginnen: { pret: "begann", part: "begonnen", aux: "haben" },
    schwimmen: { pret: "schwamm", part: "geschwommen", aux: "sein" },
    singen: { pret: "sang", part: "gesungen", aux: "haben" },
    treffen: { pret: "traf", part: "getroffen", aux: "haben", du: "triffst", er: "trifft", imp: "triff" },
    brechen: { pret: "brach", part: "gebrochen", aux: "haben", du: "brichst", er: "bricht", imp: "brich" },
    wachsen: { pret: "wuchs", part: "gewachsen", aux: "sein", du: "wächst", er: "wächst" },
    waschen: { pret: "wusch", part: "gewaschen", aux: "haben", du: "wäschst", er: "wäscht" },
    heißen: { pret: "hieß", part: "geheißen", aux: "haben", du: "heißt", er: "heißt" },
    scheinen: { pret: "schien", part: "geschienen", aux: "haben" },
    steigen: { pret: "stieg", part: "gestiegen", aux: "sein" },
    schreien: { pret: "schrie", part: "geschrien", aux: "haben" },
  };

  function deParts(verb) {
    if (!verb) return null;
    const v = verb.trim().toLowerCase();
    if (!v.endsWith("en") && !v.endsWith("n")) return null;
    let prefix = "";
    for (const p of DE_SEP) {
      if (v.startsWith(p) && v.length > p.length + 2) {
        const rest = v.slice(p.length);
        if (rest.endsWith("en") && rest.length >= 4) {
          prefix = p;
          break;
        }
      }
    }
    const base = prefix ? v.slice(prefix.length) : v;
    const stem = base.endsWith("en") ? base.slice(0, -2) : base.slice(0, -1);
    return { prefix, base, stem };
  }

  function dePresentBase(base, stem) {
    const s = DE_STRONG[base];
    if (s && s.presFull) return s.presFull.slice();
    const needsE = /[td]$/.test(stem);
    const sib = /[sßzx]$/.test(stem);
    const du = s && s.du ? s.du : sib ? stem + "t" : stem + (needsE ? "e" : "") + "st";
    const er = s && s.er ? s.er : stem + (needsE ? "e" : "") + "t";
    return [stem + "e", du, er, stem + "en", stem + (needsE ? "et" : "t"), stem + "en"];
  }

  function dePartizip(base, stem) {
    const s = DE_STRONG[base];
    if (s) return s.part;
    const e = /[td]$/.test(stem) ? "e" : "";
    return "ge" + stem + e + "t";
  }

  function dePrateritum(base, stem) {
    const s = DE_STRONG[base];
    if (s) {
      const p = s.pret;
      return [p, p + "st", p, p + "en", p + "t", p + "en"];
    }
    const e = /[td]$/.test(stem) ? "e" : "";
    return [0, 1, 2, 3, 4, 5].map((i) => {
      const suf = ["te", "test", "te", "ten", "tet", "ten"][i];
      return stem + e + suf;
    });
  }

  function deKonjunktiv2(base, stem) {
    const s = DE_STRONG[base];
    const k = s && s.k2 ? s.k2 : null;
    if (k) return [k + "e", k + "est", k + "e", k + "en", k + "et", k + "en"];
    // weak/mixed: identical to Präteritum; strong without k2: Präteritum + e
    const pret = dePrateritum(base, stem);
    if (s) return pret.map((f) => (f.endsWith("e") ? f : f + "e"));
    return pret; // weak
  }

  function deImperativeBase(base, stem) {
    const s = DE_STRONG[base];
    const du = s && s.imp ? s.imp : stem + (/[td]$/.test(stem) ? "e" : "");
    return { du, ihr: stem + (/[td]$/.test(stem) ? "et" : "t"), sie: base };
  }

  function deConjugate(verb) {
    const p = deParts(verb);
    if (!p) return null;
    const { prefix, base, stem } = p;
    const pre = (f) => (prefix ? prefix + f : f);

    const pres = dePresentBase(base, stem).map(pre);
    const pret = dePrateritum(base, stem).map(pre);
    const part = prefix ? prefix + dePartizip(base, stem) : dePartizip(base, stem);
    // Separable motion/state verbs take "sein" (aufstehen → ist aufgestanden);
    // otherwise the base verb's auxiliary decides.
    const DE_SEIN_BASE = [
      "gehen", "kommen", "laufen", "fahren", "fliegen", "steigen", "stehen",
      "fallen", "bleiben", "werden", "sein", "rennen", "schwimmen",
    ];
    const aux = prefix && DE_SEIN_BASE.includes(base)
      ? "sein"
      : (DE_STRONG[base] && DE_STRONG[base].aux) || "haben";

    // Perfekt: present of haben/sein + Partizip II.
    const auxPres = aux === "sein"
      ? ["bin", "bist", "ist", "sind", "seid", "sind"]
      : ["habe", "hast", "hat", "haben", "habt", "haben"];
    const perfekt = auxPres.map((a) => a + " " + part);

    // Futur I: present of werden + infinitive.
    const werd = ["werde", "wirst", "wird", "werden", "werdet", "werden"];
    const futur = werd.map((w) => w + " " + pre(base));

    const k2 = deKonjunktiv2(base, stem).map(pre);
    const imp = deImperativeBase(base, stem);
    const imperative = {
      du: pre(imp.du),
      ihr: pre(imp.ihr),
      sie: imp.sie + " Sie",
    };
    if (prefix) imperative.sie = pre(base) + " Sie";

    return {
      lang: "de",
      infinitive: prefix + base,
      persons: DE_PERSONS,
      tenses: [
        { name: "Präsens", forms: pres },
        { name: "Präteritum", forms: pret },
        { name: "Perfekt", forms: perfekt },
        { name: "Futur I", forms: futur },
        { name: "Konjunktiv II", forms: k2 },
      ],
      nonFinite: [{ name: "Partizip II", form: part }],
      imperative,
      note: "",
    };
  }

  function conjugate(verb, lang) {
    if (!verb) return null;
    return lang === "de" ? deConjugate(verb) : esConjugate(verb);
  }

  const api = { conjugate, esConjugate, deConjugate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.VocabConjugate = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
