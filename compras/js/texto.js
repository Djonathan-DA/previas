/* Interpretação de texto: o que está escrito na descrição de um produto.

   Duas coisas moram aqui, porque as duas são "adivinhar a partir de um nome":
   1. `adivinharCategoria` — a categoria de um produto pelo nome dele, usado tanto no
      cupom fiscal lido por foto quanto na lista colada do WhatsApp;
   2. `interpretarLinha` / `interpretarLista` — transformar texto solto em itens.

   Fica separado do app justamente por ser lógica pura, sem tela: dá para testar linha a
   linha, e é o tipo de coisa que quebra em silêncio se não for testada assim. */

(function (global) {
  'use strict';

  var CATEGORIA_PADRAO = 'outros';   // tem que casar com CATEGORIAS em app.js

  /* Palavras que aparecem na descrição do cupom fiscal, para separar por categoria o que
     foi lido da nota. É chute informado, não verdade: a tela deixa corrigir. Os termos
     estão sem acento porque a comparação é feita sobre o texto já sem acentuação. */
  var PALAVRAS = [
    ['hortifruti', ['ALFACE', 'TOMATE', 'CEBOLA', 'ALHO', 'BATATA', 'CENOURA', 'BANANA',
      'MACA', 'LARANJA', 'LIMAO', 'MAMAO', 'MELANCIA', 'MELAO', 'UVA', 'MANGA', 'ABACAXI',
      'PERA', 'MORANGO', 'ABACATE', 'GOIABA', 'COUVE', 'REPOLHO', 'BROCOLIS', 'ABOBRINHA',
      'ABOBORA', 'PEPINO', 'PIMENTAO', 'BETERRABA', 'CHUCHU', 'MANDIOCA', 'INHAME',
      'SALSA', 'CHEIRO VERDE', 'RUCULA', 'AGRIAO', 'ESPINAFRE', 'VERDURA', 'LEGUME',
      'FRUTA', 'HORTIFRUTI', 'COENTRO', 'MARACUJA', 'TANGERINA', 'BERINJELA', 'QUIABO']],
    ['carne', ['CARNE', 'BOVIN', 'SUIN', 'FRANGO', 'PEITO', 'COXA', 'SOBRECOXA', 'ASA DE',
      'PATINHO', 'ALCATRA', 'COXAO', 'ACEM', 'MUSCULO', 'FRALDINHA', 'PICANHA', 'MAMINHA',
      'CONTRA FILE', 'CONTRAFILE', 'FILE', 'COSTELA', 'LINGUICA', 'BACON', 'PERNIL',
      'LOMBO', 'CUPIM', 'MOIDA', 'MOIDO', 'PEIXE', 'TILAPIA', 'SALMAO', 'SARDINHA',
      'CAMARAO', 'MERLUZA', 'PESCADA', 'BIFE', 'HAMBURGUER', 'SALSICHA', 'PRESUNTO',
      'MORTADELA', 'SALAME', 'CALABRESA']],
    ['padaria', ['PAO', 'PAES', 'BAGUETE', 'BISNAGA', 'BOLO', 'ROSCA', 'SONHO', 'CROISSANT',
      'TORTA', 'PADARIA', 'FORMA INTEGRAL', 'BRIOCHE']],
    ['bebida', ['REFRIGERANTE', 'REFRIG', 'COCA', 'GUARANA', 'FANTA', 'SPRITE', 'PEPSI',
      'SUCO', 'AGUA', 'CERVEJA', 'VINHO', 'ENERGETICO', 'ISOTONIC', 'CHA GELADO',
      'NECTAR', 'REFRESCO', 'WHISKY', 'VODKA', 'CACHACA', 'ESPUMANTE', 'TONICA']],
    ['lanche', ['BISCOITO', 'BOLACHA', 'CHOCOLATE', 'BOMBOM', 'SALGADINHO', 'CHIPS',
      'PIPOCA', 'BALA', 'CHICLETE', 'WAFER', 'DOCE', 'PACOCA', 'AMENDOIM', 'SORVETE',
      'PIRULITO', 'BARRA DE CEREAL', 'TORRADA', 'RUFFLES', 'DORITOS', 'TRIDENT']],
    ['limpeza', ['DETERGENTE', 'SABAO', 'AMACIANTE', 'DESINFET', 'AGUA SANIT', 'CANDIDA',
      'CLORO', 'ALVEJANTE', 'LIMPADOR', 'MULTIUSO', 'VEJA', 'YPE', 'OMO', 'BRILHANTE',
      'ESPONJA', 'PANO DE CHAO', 'VASSOURA', 'RODO', 'SACO DE LIXO', 'LUSTRA',
      'DESENGORDUR', 'LIMPA VIDRO', 'AJAX', 'PINHO']],
    ['higiene', ['SABONETE', 'SHAMPOO', 'XAMPU', 'CONDICIONADOR', 'CREME DENTAL',
      'PASTA DE DENTE', 'ESCOVA DENTAL', 'FIO DENTAL', 'DESODORANTE', 'PAPEL HIGIENICO',
      'ABSORVENTE', 'FRALDA', 'LENCO', 'ALGODAO', 'COTONETE', 'HIDRATANTE', 'BARBEAR',
      'GILLETTE', 'ENXAGUANTE', 'LISTERINE', 'COLGATE', 'PROTETOR SOLAR', 'TALCO']],
    ['pet', ['RACAO', 'PETISCO', 'GATO', 'CACHORRO', 'CAO ', 'PEDIGREE', 'WHISKAS',
      'AREIA HIGIENICA', 'ANTIPULGAS', 'PET ']],
    ['casa', ['PILHA', 'LAMPADA', 'GUARDANAPO', 'PAPEL TOALHA', 'PAPEL ALUMINIO',
      'FILME PVC', 'FOSFORO', 'ISQUEIRO', 'VELA', 'COPO DESC', 'PRATO DESC', 'TALHER',
      'POTE', 'CABIDE', 'INSETICIDA', 'NAFTALINA']],
    ['alimentacao', ['ARROZ', 'FEIJAO', 'MACARRAO', 'ESPAGUETE', 'FARINHA', 'ACUCAR',
      'SAL ', 'OLEO', 'AZEITE', 'VINAGRE', 'MOLHO', 'EXTRATO DE TOMATE', 'LEITE',
      'IOGURTE', 'QUEIJO', 'MANTEIGA', 'MARGARINA', 'REQUEIJAO', 'OVO', 'CAFE',
      'ACHOCOLATADO', 'NESCAU', 'TODDY', 'CEREAL', 'AVEIA', 'GRANOLA', 'MILHO',
      'ERVILHA', 'ATUM', 'SARDINHA LATA', 'TEMPERO', 'CALDO', 'CATCHUP', 'KETCHUP',
      'MAIONESE', 'MOSTARDA', 'GELATINA', 'PUDIM', 'CREME DE LEITE', 'LEITE CONDENSADO',
      'FERMENTO', 'AMIDO', 'LASANHA', 'PIZZA', 'CONGELAD', 'TRIGO', 'POLVILHO']]
  ];

  function semAcento(texto) {
    return String(texto).toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function adivinharCategoria(descricao) {
    var alvo = semAcento(descricao);
    for (var i = 0; i < PALAVRAS.length; i++) {
      var grupo = PALAVRAS[i];
      for (var j = 0; j < grupo[1].length; j++) {
        if (alvo.indexOf(grupo[1][j]) !== -1) return grupo[0];
      }
    }
    return CATEGORIA_PADRAO;
  }

  /* ---------------- colar uma lista pronta (WhatsApp, bloco de notas…) ----------------

     Entende o que as pessoas realmente escrevem: com traço, bolinha, número, caixinha de
     marcar, emoji, quantidade antes ou depois, com preço ou sem preço nenhum. E entende
     também o texto que o próprio app compartilha, para a lista que ela mandar voltar
     inteira aqui. */

  // marcas de lista no começo da linha: - – — * • · > + 1. 1) [ ] [x]
  var MARCAS = /^[\s\-–—*•·▪◦>+]+|^\d{1,2}[.)]\s+|^\[\s*[xX✓]?\s*\]\s*/;
  var EMOJI = /^[\s -⁯←-⇿⌀-➿⬀-⯿️\u{1F000}-\u{1FAFF}]+/u;

  /* Linhas que não são produto: o resumo que o próprio app compartilha e o título que
     as pessoas põem no começo ("Lista do mercado", "Lista da semana", "Compras"). Ninguém
     compra um produto chamado "lista", então cortar por ela é seguro. */
  var LINHA_DE_RESUMO = /^(total|subtotal|nota fiscal|lista|compras)\b|:\s*\d+\s*ite(m|ns)\b/i;

  var UNIDADES = /^(kg|g|ml|l|lt|un|und|cx|pct|pc|pacote|litro|litros|quilo|quilos|dz|duzia|dúzia)$/i;

  function limparMarcas(texto) {
    var antes;
    var t = texto;
    do {                       // "- 🥬 Banana" tem marca E emoji, em qualquer ordem
      antes = t;
      t = t.replace(MARCAS, '').replace(EMOJI, '');
    } while (t !== antes && t);
    return t.trim();
  }

  function interpretarLinha(bruta) {
    var texto = limparMarcas(String(bruta || ''));
    if (!texto || LINHA_DE_RESUMO.test(texto)) return null;

    var precoCent = 0;

    // preço com centavos (12,90 · 12.90 · R$ 12,90) — vale o último da linha
    var comCentavos = /(?:r\$\s*)?(\d{1,4})[.,](\d{2})(?!\d)/gi;
    var m, ultimo = null;
    while ((m = comCentavos.exec(texto)) !== null) ultimo = m;
    if (ultimo) {
      precoCent = parseInt(ultimo[1], 10) * 100 + parseInt(ultimo[2], 10);
      texto = texto.slice(0, ultimo.index) + ' ' + texto.slice(ultimo.index + ultimo[0].length);
    } else {
      // preço redondo só conta com o R$ na frente: "Ovos 12" é quantidade, não preço
      var redondo = texto.match(/r\$\s*(\d{1,4})(?![\d.,])/i);
      if (redondo) {
        precoCent = parseInt(redondo[1], 10) * 100;
        texto = texto.replace(redondo[0], ' ');
      }
    }

    var qtd = 1;

    // "(2x)" — do jeito que o próprio app escreve ao compartilhar
    var entreParenteses = texto.match(/\((\d{1,2})\s*x\)/i);
    if (entreParenteses) {
      qtd = parseInt(entreParenteses[1], 10);
      texto = texto.replace(entreParenteses[0], ' ');
    } else {
      var inicio = texto.match(/^(\d{1,2})\s*x\s+/i) ||   // "2x Leite" / "2 x Leite"
                   texto.match(/\s(\d{1,2})\s*x\s*$/i);   // "Leite 2x"
      if (inicio) {
        qtd = parseInt(inicio[1], 10);
        texto = texto.replace(inicio[0], ' ');
      } else {
        // "3 Ovos" é quantidade; "5 kg de arroz" não é — o que vem depois é unidade
        var solto = texto.match(/^(\d{1,2})\s+(\S+)/);
        if (solto && !UNIDADES.test(solto[2])) {
          qtd = parseInt(solto[1], 10);
          texto = texto.slice(solto[1].length).trim();
        }
      }
    }

    var nome = texto
      .replace(/\s+/g, ' ')
      .replace(/^[\s\-–—:.]+|[\s\-–—:.]+$/g, '')
      .trim();

    if (nome.replace(/[^A-Za-zÀ-ÿ]/g, '').length < 2) return null;
    if (nome.length > 60) nome = nome.slice(0, 60).trim();

    return {
      nome: nome,
      qtd: Math.min(99, Math.max(1, qtd)),
      precoCent: precoCent,
      categoria: adivinharCategoria(nome)
    };
  }

  function interpretarLista(texto) {
    return String(texto || '').split(/\r?\n/).map(interpretarLinha).filter(Boolean);
  }

  global.Texto = {
    adivinharCategoria: adivinharCategoria,
    interpretarLinha: interpretarLinha,
    interpretarLista: interpretarLista
  };
})(window);
