/* Camada de conteúdo editável — compartilhada pelo site e pelo painel.
 *
 * O site continua sendo HTML estático com todo o texto escrito nele. Este
 * arquivo não substitui isso: ele aplica POR CIMA o que estiver em
 * conteudo.json. Se o JSON não existir, falhar ou vier quebrado, o site fica
 * exatamente como está hoje.
 *
 * Essa escolha importa. Um site que monta a página a partir de um JSON fica
 * refém dele: qualquer erro de rede vira página em branco. Aqui o pior caso é
 * uma edição não aparecer, e o dono da loja liga para reclamar do texto antigo,
 * não do site fora do ar.
 *
 * O mesmo mapa serve aos dois lados: o site usa para aplicar, e o painel usa
 * para saber quais campos existem, como chamá-los e onde mexem.
 */
(function (raiz) {
  "use strict";

  // tipo:
  //   texto   troca o texto do elemento inteiro
  //   html    idem, aceitando marcação (usado onde há <br> e <em>)
  //   rotulo  troca só o texto solto, preservando ícones irmãos (botões)
  //   cor     variável CSS no :root
  //   foto    atributo src de uma imagem
  //   lista   itens separados por vírgula, refazendo os filhos
  var CAMPOS = {
    // ── Início ──────────────────────────────────────────────────────────
    "hero.titulo":  {sel: ".heroi h1", tipo: "html", grupo: "Início",
                     rotulo: "Título principal", dica: "Use <em>palavra</em> para deixar uma palavra em destaque e <br> para quebrar a linha."},
    "hero.texto":   {sel: ".heroi .conduz", tipo: "texto", grupo: "Início",
                     rotulo: "Texto abaixo do título", linhas: 3},
    "hero.botao1":  {sel: ".heroi .acoes .bt-zap", tipo: "rotulo", grupo: "Início",
                     rotulo: "Botão principal"},
    "hero.botao2":  {sel: ".heroi .acoes .bt-linha", tipo: "texto", grupo: "Início",
                     rotulo: "Botão secundário"},
    "hero.notaForte": {sel: ".nota-txt b", tipo: "texto", grupo: "Início",
                     rotulo: "Nota do Google (destaque)"},

    // ── Faixa de destaques ──────────────────────────────────────────────
    "provas.1t": {sel: ".provas .prova:nth-of-type(1) b", tipo: "texto", grupo: "Destaques", rotulo: "Destaque 1 — título"},
    "provas.1d": {sel: ".provas .prova:nth-of-type(1) span", tipo: "texto", grupo: "Destaques", rotulo: "Destaque 1 — descrição"},
    "provas.2t": {sel: ".provas .prova:nth-of-type(2) b", tipo: "texto", grupo: "Destaques", rotulo: "Destaque 2 — título"},
    "provas.2d": {sel: ".provas .prova:nth-of-type(2) span", tipo: "texto", grupo: "Destaques", rotulo: "Destaque 2 — descrição"},
    "provas.3t": {sel: ".provas .prova:nth-of-type(3) b", tipo: "texto", grupo: "Destaques", rotulo: "Destaque 3 — título"},
    "provas.3d": {sel: ".provas .prova:nth-of-type(3) span", tipo: "texto", grupo: "Destaques", rotulo: "Destaque 3 — descrição"},
    "provas.4t": {sel: ".provas .prova:nth-of-type(4) b", tipo: "texto", grupo: "Destaques", rotulo: "Destaque 4 — título"},
    "provas.4d": {sel: ".provas .prova:nth-of-type(4) span", tipo: "texto", grupo: "Destaques", rotulo: "Destaque 4 — descrição"},

    // ── Ração a granel ──────────────────────────────────────────────────
    "granel.chapeu": {sel: "#granel .chapeu", tipo: "texto", grupo: "Ração a granel", rotulo: "Chapéu da seção"},
    "granel.titulo": {sel: "#granel h2", tipo: "html", grupo: "Ração a granel", rotulo: "Título",
                      dica: "Aceita <br> para quebrar a linha."},
    "granel.texto":  {sel: "#granel .sub", tipo: "texto", grupo: "Ração a granel", rotulo: "Texto", linhas: 3},
    "granel.p1": {sel: "#granel .passos li:nth-of-type(1) span", tipo: "texto", grupo: "Ração a granel", rotulo: "Passo 1"},
    "granel.p2": {sel: "#granel .passos li:nth-of-type(2) span", tipo: "texto", grupo: "Ração a granel", rotulo: "Passo 2"},
    "granel.p3": {sel: "#granel .passos li:nth-of-type(3) span", tipo: "texto", grupo: "Ração a granel", rotulo: "Passo 3"},
    "granel.botao": {sel: "#granel .bt-zap", tipo: "texto", grupo: "Ração a granel", rotulo: "Botão"},

    // ── Produtos ────────────────────────────────────────────────────────
    "prod.chapeu": {sel: "#produtos .chapeu", tipo: "texto", grupo: "Produtos", rotulo: "Chapéu da seção"},
    "prod.titulo": {sel: "#produtos h2", tipo: "html", grupo: "Produtos", rotulo: "Título",
                      dica: "Aceita <br> para quebrar a linha."},
    "prod.texto":  {sel: "#produtos .sub", tipo: "texto", grupo: "Produtos", rotulo: "Texto", linhas: 2},
    "cat.1t": {sel: ".bento .cat:nth-of-type(1) h3", tipo: "texto", grupo: "Produtos", rotulo: "Card 1 — título"},
    "cat.1d": {sel: ".bento .cat:nth-of-type(1) p", tipo: "texto", grupo: "Produtos", rotulo: "Card 1 — descrição", linhas: 2},
    "cat.2t": {sel: ".bento .cat:nth-of-type(2) h3", tipo: "texto", grupo: "Produtos", rotulo: "Card 2 — título"},
    "cat.2d": {sel: ".bento .cat:nth-of-type(2) p", tipo: "texto", grupo: "Produtos", rotulo: "Card 2 — descrição", linhas: 2},
    "cat.3t": {sel: ".bento .cat:nth-of-type(3) h3", tipo: "texto", grupo: "Produtos", rotulo: "Card 3 — título"},
    "cat.3d": {sel: ".bento .cat:nth-of-type(3) p", tipo: "texto", grupo: "Produtos", rotulo: "Card 3 — descrição", linhas: 2},
    "cat.4t": {sel: ".bento .cat:nth-of-type(4) h3", tipo: "texto", grupo: "Produtos", rotulo: "Card 4 — título"},
    "cat.4d": {sel: ".bento .cat:nth-of-type(4) p", tipo: "texto", grupo: "Produtos", rotulo: "Card 4 — descrição", linhas: 2},
    "cat.5t": {sel: ".bento .cat:nth-of-type(5) h3", tipo: "texto", grupo: "Produtos", rotulo: "Card 5 — título"},
    "cat.5d": {sel: ".bento .cat:nth-of-type(5) p", tipo: "texto", grupo: "Produtos", rotulo: "Card 5 — descrição", linhas: 2},

    // ── Marcas ──────────────────────────────────────────────────────────
    "marcas.titulo": {sel: ".marcas-titulo", tipo: "texto", grupo: "Marcas", rotulo: "Título da faixa"},
    "marcas.lista":  {sel: ".trilho", tipo: "lista", grupo: "Marcas", linhas: 3,
                      rotulo: "Marcas", dica: "Separe por vírgula. A faixa desliza sozinha."},

    // ── A loja ──────────────────────────────────────────────────────────
    "loja.chapeu": {sel: "#loja .chapeu", tipo: "texto", grupo: "A loja", rotulo: "Chapéu da seção"},
    "loja.titulo": {sel: "#loja h2", tipo: "html", grupo: "A loja", rotulo: "Título",
                      dica: "Aceita <br> para quebrar a linha."},
    "loja.texto":  {sel: "#loja .sub", tipo: "texto", grupo: "A loja", rotulo: "Texto", linhas: 3},
    "loja.botao":  {sel: "#loja > .env > .bt-linha", tipo: "texto", grupo: "A loja", rotulo: "Botão"},

    // ── Onde ficamos ────────────────────────────────────────────────────
    "local.chapeu":   {sel: "#local .chapeu", tipo: "texto", grupo: "Onde ficamos", rotulo: "Chapéu da seção"},
    "local.titulo":   {sel: "#local h2", tipo: "html", grupo: "Onde ficamos", rotulo: "Título",
                      dica: "Aceita <br> para quebrar a linha."},
    "local.endereco": {sel: ".fatos li:nth-of-type(1) span", tipo: "html", grupo: "Onde ficamos", rotulo: "Endereço", linhas: 2,
                      dica: "Aceita <br> para quebrar a linha."},
    "local.horario":  {sel: ".fatos li:nth-of-type(2) span", tipo: "texto", grupo: "Onde ficamos", rotulo: "Horário"},
    "local.telefone": {sel: ".fatos li:nth-of-type(3) span", tipo: "texto", grupo: "Onde ficamos", rotulo: "Telefone"},
    "local.pagamento":{sel: ".fatos li:nth-of-type(4) span", tipo: "texto", grupo: "Onde ficamos", rotulo: "Formas de pagamento"},
    "local.acesso":   {sel: ".fatos li:nth-of-type(5) span", tipo: "texto", grupo: "Onde ficamos", rotulo: "Acessibilidade"},
    "local.mapaNome": {sel: ".mapa-pe > div > b", tipo: "texto", grupo: "Onde ficamos",
                       rotulo: "Nome no cartão do mapa"},
    "local.mapaRef":  {sel: ".mapa-pe > div", tipo: "rotulo", grupo: "Onde ficamos",
                       rotulo: "Ponto de referência"},

    // ── Chamada final ───────────────────────────────────────────────────
    "final.titulo": {sel: ".final h2", tipo: "texto", grupo: "Chamada final", rotulo: "Título"},
    "final.texto":  {sel: ".final p", tipo: "texto", grupo: "Chamada final", rotulo: "Texto", linhas: 2},
    "final.botao":  {sel: ".final .bt-zap", tipo: "rotulo", grupo: "Chamada final", rotulo: "Botão"},

    // ── Cores ───────────────────────────────────────────────────────────
    "cor.laranja": {varCss: "--laranja", tipo: "cor", grupo: "Cores", rotulo: "Laranja da marca"},
    "cor.azul":    {varCss: "--azul", tipo: "cor", grupo: "Cores", rotulo: "Azul da seção do granel"},
    "cor.creme":   {varCss: "--creme", tipo: "cor", grupo: "Cores", rotulo: "Fundo da página"},
    "cor.tinta":   {varCss: "--tinta", tipo: "cor", grupo: "Cores", rotulo: "Cor dos textos"},

    // ── Fotos ───────────────────────────────────────────────────────────
    "foto.fachada":  {sel: ".heroi-foto > img", tipo: "foto", grupo: "Fotos", rotulo: "Foto principal (fachada)"},
    "foto.cartao":   {sel: ".cartao-placa img", tipo: "foto", grupo: "Fotos", rotulo: "Foto do cartão flutuante"},
    "foto.granel1":  {sel: ".granel-fotos img:nth-of-type(1)", tipo: "foto", grupo: "Fotos", rotulo: "Granel — foto grande"},
    "foto.granel2":  {sel: ".granel-fotos img:nth-of-type(2)", tipo: "foto", grupo: "Fotos", rotulo: "Granel — foto 2"},
    "foto.granel3":  {sel: ".granel-fotos img:nth-of-type(3)", tipo: "foto", grupo: "Fotos", rotulo: "Granel — foto 3"},
    "foto.cat1":     {sel: ".bento .cat:nth-of-type(1) img", tipo: "foto", grupo: "Fotos", rotulo: "Card 1 — foto"},
    "foto.cat2":     {sel: ".bento .cat:nth-of-type(2) img", tipo: "foto", grupo: "Fotos", rotulo: "Card 2 — foto"},
    "foto.cat3":     {sel: ".bento .cat:nth-of-type(3) img", tipo: "foto", grupo: "Fotos", rotulo: "Card 3 — foto"},
    "foto.cat4":     {sel: ".bento .cat:nth-of-type(4) img", tipo: "foto", grupo: "Fotos", rotulo: "Card 4 — foto"},
    "foto.cat5":     {sel: ".bento .cat:nth-of-type(5) img", tipo: "foto", grupo: "Fotos", rotulo: "Card 5 — foto"},
    "foto.mapa":     {sel: ".mapa img", tipo: "foto", grupo: "Fotos", rotulo: "Foto da seção Onde ficamos"}
  };

  var GRUPOS = ["Início", "Destaques", "Ração a granel", "Produtos", "Marcas",
                "A loja", "Onde ficamos", "Chamada final", "Cores", "Fotos"];

  // Só esta marcação passa nos campos de texto rico. O conteudo.json é público
  // e é aplicado na página de todo visitante: se a chave de publicação vazar um
  // dia, o estrago fica limitado a texto feio, não a script rodando no
  // navegador de quem visita a loja.
  var TAGS_OK = /^(em|b|strong|br|span|i|u)$/i;

  // Elementos que somem inteiros, com conteúdo e tudo. Desembrulhar um <script>
  // preservaria o texto do código dentro do título, que é lixo visível.
  var TAGS_FORA = /^(script|style|iframe|object|embed|link|meta|base|form|svg)$/i;

  function limpar(doc, html) {
    // DOMParser monta um documento inerte: nada é buscado, nenhum onerror
    // dispara. A primeira versão usava innerHTML numa div solta, e um
    // <img src=x onerror=...> ainda executava, porque o navegador tenta
    // carregar a imagem no instante em que a marcação é analisada.
    var inerte;
    try {
      inerte = new DOMParser().parseFromString("<body>" + String(html), "text/html");
    } catch (e) {
      return String(html).replace(/[<>]/g, "");
    }
    var todos = inerte.body.querySelectorAll("*");
    for (var i = todos.length - 1; i >= 0; i--) {
      var el = todos[i];
      if (TAGS_FORA.test(el.tagName)) { el.parentNode.removeChild(el); continue; }
      if (!TAGS_OK.test(el.tagName)) {
        while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
        el.parentNode.removeChild(el);
        continue;
      }
      for (var a = el.attributes.length - 1; a >= 0; a--) {
        var nome = el.attributes[a].name;
        if (nome !== "class") el.removeAttribute(nome);
      }
    }
    return inerte.body.innerHTML;
  }

  function alvo(doc, campo) {
    try { return doc.querySelector(campo.sel); } catch (e) { return null; }
  }

  /* Troca só o texto solto do elemento, deixando ícones e filhos em paz.
     Botão com SVG dentro perderia o ícone se usasse textContent. */
  function trocarRotulo(el, valor) {
    for (var i = el.childNodes.length - 1; i >= 0; i--) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.textContent.trim()) { n.textContent = " " + valor; return; }
    }
    el.appendChild(el.ownerDocument.createTextNode(" " + valor));
  }

  function lerUm(doc, chave) {
    var campo = CAMPOS[chave];
    if (!campo) return null;
    if (campo.tipo === "cor") {
      var v = doc.documentElement.style.getPropertyValue(campo.varCss);
      if (v) return v.trim();
      return getComputedStyle(doc.documentElement).getPropertyValue(campo.varCss).trim();
    }
    var el = alvo(doc, campo);
    if (!el) return null;
    if (campo.tipo === "foto") return el.getAttribute("src");
    if (campo.tipo === "html") return el.innerHTML.trim();
    if (campo.tipo === "rotulo") {
      // Espelha a escrita: só o texto solto, sem o que está dentro de filhos.
      // Lendo o elemento inteiro, o campo abria já preenchido com o negrito do
      // vizinho junto, e salvar duplicava o nome na tela.
      for (var j = el.childNodes.length - 1; j >= 0; j--) {
        var n = el.childNodes[j];
        if (n.nodeType === 3 && n.textContent.trim()) return n.textContent.trim();
      }
      return "";
    }
    if (campo.tipo === "lista") {
      var vistos = [], filhos = el.querySelectorAll("span");
      for (var i = 0; i < filhos.length; i++) {
        var t = filhos[i].textContent.trim();
        if (t && vistos.indexOf(t) === -1) vistos.push(t);
      }
      return vistos.join(", ");
    }
    return el.textContent.trim();
  }

  function aplicarUm(doc, chave, valor) {
    var campo = CAMPOS[chave];
    if (!campo || valor === null || valor === undefined) return false;
    if (campo.tipo === "cor") {
      doc.documentElement.style.setProperty(campo.varCss, valor);
      return true;
    }
    var el = alvo(doc, campo);
    if (!el) return false;
    if (campo.tipo === "foto") {
      // só caminho do próprio site ou imagem embutida; javascript: em src de
      // <img> não executa, mas o hábito de conferir esquema é barato
      var v = String(valor).trim();
      if (/^(javascript|vbscript|file):/i.test(v)) return false;
      el.setAttribute("src", v); el.removeAttribute("srcset"); return true;
    }
    if (campo.tipo === "html") { el.innerHTML = limpar(doc, valor); return true; }
    if (campo.tipo === "rotulo") { trocarRotulo(el, valor); return true; }
    if (campo.tipo === "lista") {
      var itens = String(valor).split(",").map(function (s) { return s.trim(); })
                   .filter(function (s) { return s; });
      el.innerHTML = "";
      // duplica a lista porque a faixa desliza em laço: sem a segunda cópia
      // aparece um vazio quando a primeira termina de passar
      for (var v = 0; v < 2; v++) {
        for (var i = 0; i < itens.length; i++) {
          var s = doc.createElement("span");
          s.textContent = itens[i];
          if (v === 1) s.setAttribute("aria-hidden", "true");
          el.appendChild(s);
        }
      }
      el.setAttribute("aria-label", itens.join(", "));
      return true;
    }
    el.textContent = valor;
    return true;
  }

  function aplicar(doc, conteudo) {
    if (!conteudo) return 0;
    var n = 0;
    for (var chave in conteudo) {
      if (Object.prototype.hasOwnProperty.call(conteudo, chave) && CAMPOS[chave]) {
        if (aplicarUm(doc, chave, conteudo[chave])) n++;
      }
    }
    return n;
  }

  function lerTudo(doc) {
    var out = {};
    for (var chave in CAMPOS) {
      if (Object.prototype.hasOwnProperty.call(CAMPOS, chave)) {
        var v = lerUm(doc, chave);
        if (v !== null) out[chave] = v;
      }
    }
    return out;
  }

  /* ── Modo de edição por clique ──────────────────────────────────────────
     Ler "Card 3 — título" numa lista não diz nada para quem não montou o site.
     Aqui o dono da loja aponta para a coisa na tela e mexe nela. O painel
     continua existindo como lista, mas deixa de ser o único caminho.

     Roda só dentro do iframe do painel. O site que o cliente final abre não
     carrega nada disto. */
  var ESTILO_EDICAO = [
    // O tracejado em tudo mostra o que dá para tocar, mas cobre o site de
    // caixinhas e o dono deixa de ver como a página ficou, que é metade do
    // motivo de existir a prévia. Então ele aparece por alguns segundos ao
    // abrir, some, e volta quando o dono pedir pelo botão.
    "[data-msp]{cursor:pointer;border-radius:3px;",
    "  transition:outline-color .25s,background .25s}",
    "body.msp-guias [data-msp]{outline:1.5px dashed rgba(244,124,32,.42);outline-offset:3px}",
    "[data-msp]:hover{outline:2px solid #F47C20;outline-offset:4px;",
    "  background:rgba(244,124,32,.09)}",
    "[data-msp].msp-foco{outline:2.5px solid #F47C20;outline-offset:5px;",
    "  background:rgba(244,124,32,.16);animation:mspPulso 1.1s ease-out}",
    "@keyframes mspPulso{0%{box-shadow:0 0 0 0 rgba(244,124,32,.5)}",
    "  100%{box-shadow:0 0 0 22px rgba(244,124,32,0)}}",
    ".msp-dica{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:99999;",
    "  background:#231810;color:#fff;font:600 13px/1.3 system-ui,sans-serif;",
    "  padding:9px 16px;border-radius:99px;pointer-events:none;white-space:nowrap;",
    "  box-shadow:0 8px 24px -8px rgba(0,0,0,.5);opacity:0;transition:opacity .4s}",
    ".msp-dica.ver{opacity:.94}"
  ].join("");

  function modoEdicao(doc) {
    var css = doc.createElement("style");
    css.textContent = ESTILO_EDICAO;
    doc.head.appendChild(css);

    var dica = doc.createElement("div");
    dica.className = "msp-dica";
    dica.textContent = "Toque em qualquer parte do site para editar";
    doc.body.appendChild(dica);
    doc.body.classList.add("msp-guias");
    setTimeout(function () { dica.classList.add("ver"); }, 600);
    setTimeout(function () {
      dica.classList.remove("ver");
      doc.body.classList.remove("msp-guias");
    }, 4200);

    for (var chave in CAMPOS) {
      if (!Object.prototype.hasOwnProperty.call(CAMPOS, chave)) continue;
      if (CAMPOS[chave].tipo === "cor") continue;   // cor não tem elemento só dela
      var el = alvo(doc, CAMPOS[chave]);
      if (el) el.setAttribute("data-msp", chave);
    }

    doc.addEventListener("click", function (ev) {
      // Dentro do painel, seguir um link levaria a prévia para o WhatsApp e o
      // dono ficaria olhando uma conversa em vez do site dele.
      var link = ev.target.closest ? ev.target.closest("a") : null;
      if (link) { ev.preventDefault(); }
      var el = ev.target.closest ? ev.target.closest("[data-msp]") : null;
      if (!el) return;
      ev.preventDefault();
      ev.stopPropagation();
      try {
        window.parent.postMessage({msp: "escolheu", campo: el.getAttribute("data-msp")}, "*");
      } catch (e) {}
    }, true);
  }

  function guias(doc, ligado) {
    doc.body.classList.toggle("msp-guias", !!ligado);
  }

  function destacar(doc, chave) {
    var campo = CAMPOS[chave];
    if (!campo || campo.tipo === "cor") return;
    var el = alvo(doc, campo);
    if (!el) return;
    var antigos = doc.querySelectorAll(".msp-foco");
    for (var i = 0; i < antigos.length; i++) antigos[i].classList.remove("msp-foco");
    el.classList.add("msp-foco");
    try { el.scrollIntoView({behavior: "smooth", block: "center"}); } catch (e) { el.scrollIntoView(); }
    setTimeout(function () { el.classList.remove("msp-foco"); }, 2400);
  }

  raiz.MSPEditor = {CAMPOS: CAMPOS, GRUPOS: GRUPOS, aplicar: aplicar,
                    aplicarUm: aplicarUm, lerUm: lerUm, lerTudo: lerTudo,
                    modoEdicao: modoEdicao, destacar: destacar, guias: guias};
})(window);

/* Carga do conteúdo publicado + canal de pré-visualização ao vivo.
 * O painel abre este site num iframe e manda cada tecla digitada por
 * postMessage, o que dá pré-visualização instantânea sem salvar nada. */
(function () {
  "use strict";
  // O painel também carrega este arquivo, mas só pelo mapa de campos. Sem esta
  // guarda o carregador rodaria lá dentro e buscaria /admin/conteudo.json, que
  // não existe: um 404 no console do cliente, e um ouvinte de mensagem a mais
  // escutando os próprios avisos que o painel manda para o iframe.
  if (!document.querySelector(".heroi")) return;
  fetch("conteudo.json?v=" + Date.now(), {cache: "no-store"})
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && j.campos) window.MSPEditor.aplicar(document, j.campos); })
    .catch(function () { /* sem conteudo.json o site fica como foi escrito */ })
    .then(function () {
      if (location.search.indexOf("painel=1") > -1) {
        try { window.MSPEditor.modoEdicao(document); } catch (e) {}
      }
      try { window.parent.postMessage({msp: "pronto"}, "*"); } catch (e) {}
    });

  window.addEventListener("message", function (ev) {
    // Sem esta linha qualquer site poderia embutir a página da MSP num iframe e
    // mandar conteúdo por postMessage. Como os campos de tipo html entram por
    // innerHTML, isso era injeção de script na página da loja, servida do
    // domínio dela. O painel roda na mesma origem, então a conferência não
    // atrapalha o uso legítimo.
    if (ev.origin !== window.location.origin) return;
    var d = ev.data;
    if (!d || d.msp !== "previa") return;
    if (d.acao === "destacar") { window.MSPEditor.destacar(document, d.campo); return; }
    if (d.acao === "guias") { window.MSPEditor.guias(document, d.ligado); return; }
    if (d.campo) window.MSPEditor.aplicarUm(document, d.campo, d.valor);
    else if (d.campos) window.MSPEditor.aplicar(document, d.campos);
  });
})();
