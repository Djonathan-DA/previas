/* Compras da Família — lista de compras com foto, preço, categorias e conferência
   da nota fiscal. Sem login: abriu, já está dentro. Tudo fica guardado no aparelho. */

(function () {
  'use strict';

  var LADO_MAXIMO = 900;   // px do maior lado da foto guardada
  var QUALIDADE = 0.72;    // compressão JPEG

  var CATEGORIAS = [
    { id: 'alimentacao', nome: 'Alimentação', emoji: '🍚' },
    { id: 'limpeza',     nome: 'Limpeza',     emoji: '🧽' },
    { id: 'higiene',     nome: 'Higiene',     emoji: '🧴' },
    { id: 'lanche',      nome: 'Lanche',      emoji: '🍫' },
    { id: 'bebida',      nome: 'Bebidas',     emoji: '🥤' },
    { id: 'casa',        nome: 'Casa',        emoji: '🏠' },
    { id: 'pet',         nome: 'Pet',         emoji: '🐾' },
    { id: 'outros',      nome: 'Outros',      emoji: '📦' }
  ];
  var CATEGORIA_PADRAO = 'outros';

  function categoria(id) {
    for (var i = 0; i < CATEGORIAS.length; i++) {
      if (CATEGORIAS[i].id === id) return CATEGORIAS[i];
    }
    return CATEGORIAS[CATEGORIAS.length - 1];
  }

  var $ = function (id) { return document.getElementById(id); };

  var itens = [];
  var nota = null;        // { foto, totalCent, quando }
  var urls = new Map();   // id do item -> object URL da foto (para revogar depois)
  var rascunho = null;    // item em edição na ficha

  /* ---------------- dinheiro ---------------- */

  var moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  function emReais(centavos) {
    return moeda.format((centavos || 0) / 100);
  }

  // O campo de preço funciona como caixa de mercado: os dígitos entram pelos centavos.
  function centavosDoTexto(texto) {
    var digitos = String(texto).replace(/\D/g, '').slice(0, 9);
    return digitos ? parseInt(digitos, 10) : 0;
  }

  function totalDaLista() {
    return itens.reduce(function (s, i) { return s + i.precoCent * i.qtd; }, 0);
  }

  /* ---------------- avisos ---------------- */

  var avisoTimer = null;
  var elAviso = $('aviso');

  function avisar(mensagem) {
    elAviso.textContent = mensagem;
    elAviso.hidden = false;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(function () { elAviso.hidden = true; }, 2600);
  }

  function textoSeguro(valor) {
    var div = document.createElement('div');
    div.textContent = valor;
    return div.innerHTML;
  }

  /* ---------------- fotos ---------------- */

  function fonteDaFoto(foto) {
    if (!foto) return null;
    if (typeof foto === 'string') return foto;          // data URL (modo reserva)
    return URL.createObjectURL(foto);                   // Blob (IndexedDB)
  }

  function soltarUrl(url, foto) {
    if (url && foto instanceof Blob) URL.revokeObjectURL(url);
  }

  function carregarImagem(arquivo) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(arquivo, { imageOrientation: 'from-image' })
        .catch(function () { return viaTagImg(arquivo); });
    }
    return viaTagImg(arquivo);
  }

  function viaTagImg(arquivo) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(arquivo);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('imagem inválida')); };
      img.src = url;
    });
  }

  // Reduz e comprime para não encher o aparelho: ~50 KB por foto em vez de 3 MB.
  function comprimir(arquivo) {
    return carregarImagem(arquivo).then(function (fonte) {
      var escala = Math.min(1, LADO_MAXIMO / Math.max(fonte.width, fonte.height));
      var tela = document.createElement('canvas');
      tela.width = Math.max(1, Math.round(fonte.width * escala));
      tela.height = Math.max(1, Math.round(fonte.height * escala));

      var ctx = tela.getContext('2d');
      // JPEG não tem transparência: sem este fundo, um PNG transparente vira preto.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, tela.width, tela.height);
      ctx.drawImage(fonte, 0, 0, tela.width, tela.height);
      if (fonte.close) fonte.close();

      return new Promise(function (resolve) {
        if (tela.toBlob) {
          tela.toBlob(function (blob) { resolve(blob || arquivo); }, 'image/jpeg', QUALIDADE);
        } else {
          resolve(tela.toDataURL('image/jpeg', QUALIDADE));
        }
      });
    });
  }

  /* Controla um par "prévia + botões de foto". A ficha do produto e a nota fiscal
     usam o mesmo comportamento, então mora num lugar só. */
  function controladorDeFoto(cfg) {
    var previa = $(cfg.previa);
    var img = $(cfg.img);
    var remover = $(cfg.remover);
    var entradaCamera = $(cfg.entradaCamera);
    var entradaGaleria = $(cfg.entradaGaleria);

    var foto = null;        // Blob ou data URL, já comprimida
    var original = null;    // arquivo cru da câmera, melhor para a leitura do preço
    var url = null;

    function mostrar() {
      soltarUrl(url, foto);
      url = null;
      if (foto) {
        url = fonteDaFoto(foto);
        img.src = url;
        img.hidden = false;
        previa.dataset.vazia = 'false';
        remover.hidden = false;
      } else {
        img.removeAttribute('src');
        img.hidden = true;
        previa.dataset.vazia = 'true';
        remover.hidden = true;
      }
      if (cfg.aoMudar) cfg.aoMudar();
    }

    function receber(entrada) {
      var arquivo = entrada.files && entrada.files[0];
      entrada.value = '';               // permite escolher a mesma foto de novo
      if (!arquivo) return;

      comprimir(arquivo).then(function (comprimida) {
        foto = comprimida;
        original = arquivo;
        mostrar();
        if (cfg.aoChegarFoto) cfg.aoChegarFoto();
      }).catch(function () {
        avisar('Não consegui ler essa imagem.');
      });
    }

    $(cfg.botaoCamera).addEventListener('click', function () { entradaCamera.click(); });
    $(cfg.botaoGaleria).addEventListener('click', function () { entradaGaleria.click(); });
    previa.addEventListener('click', function () { entradaCamera.click(); });
    entradaCamera.addEventListener('change', function () { receber(entradaCamera); });
    entradaGaleria.addEventListener('change', function () { receber(entradaGaleria); });
    remover.addEventListener('click', function () {
      foto = null;
      original = null;
      mostrar();
    });

    return {
      obter: function () { return foto; },
      definir: function (nova) { foto = nova || null; original = null; mostrar(); },
      // devolve a URL já criada, para a lista reaproveitar em vez de gerar outra
      entregarUrl: function () { var u = url; url = null; return u; },
      soltar: function () { soltarUrl(url, foto); url = null; },
      temFoto: function () { return !!foto; },
      // melhor imagem disponível para a leitura: o arquivo cru, senão a comprimida
      paraLeitura: function () {
        if (original) return Promise.resolve(original);
        if (foto instanceof Blob) return Promise.resolve(foto);
        if (typeof foto === 'string') {
          return fetch(foto).then(function (r) { return r.blob(); });
        }
        return Promise.resolve(null);
      }
    };
  }

  /* ---------------- leitura do preço na foto ---------------- */

  var ESTADOS = {
    'loading tesseract core': 'Baixando o leitor (só desta vez)',
    'loading language traineddata': 'Baixando o português (só desta vez)',
    'initializing tesseract': 'Preparando o leitor',
    'initializing api': 'Preparando o leitor',
    'recognizing text': 'Lendo a foto'
  };

  /* Liga um botão "ler da foto" a uma caixa de estado e de sugestões. */
  function criarLeitor(cfg) {
    var botao = $(cfg.botao);
    var caixa = $(cfg.caixa);
    var estado = $(cfg.estado);
    var opcoes = $(cfg.opcoes);
    var ocupado = false;

    function mostrarEstado(texto) {
      caixa.hidden = false;
      estado.textContent = texto;
    }

    function limparOpcoes() {
      opcoes.textContent = '';
    }

    function desenharOpcoes(lista) {
      limparOpcoes();
      lista.forEach(function (v, i) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip' + (i === 0 ? ' chip-ativo' : '');
        chip.textContent = emReais(v.centavos);
        chip.addEventListener('click', function () {
          cfg.aoEscolher(v.centavos);
          Array.prototype.forEach.call(opcoes.children, function (c) {
            c.classList.remove('chip-ativo');
          });
          chip.classList.add('chip-ativo');
        });
        opcoes.appendChild(chip);
      });
    }

    function executar() {
      if (ocupado) return;
      ocupado = true;
      botao.disabled = true;
      limparOpcoes();
      mostrarEstado('Preparando o leitor…');

      cfg.foto.paraLeitura().then(function (arquivo) {
        if (!arquivo) throw new Error('sem foto');
        var ler = cfg.tipo === 'nota' ? Leitor.totalDaNota : Leitor.precosNaEtiqueta;
        return ler(arquivo, function (passo, progresso) {
          var nome = ESTADOS[passo] || 'Lendo a foto';
          mostrarEstado(nome + '… ' + Math.round(progresso * 100) + '%');
        });
      }).then(function (achados) {
        if (!achados.length) {
          mostrarEstado(cfg.tipo === 'nota'
            ? 'Não achei o total na foto. Digite abaixo.'
            : 'Não achei o preço na foto. Digite abaixo.');
          return;
        }
        cfg.aoEscolher(achados[0].centavos);
        mostrarEstado(achados.length > 1
          ? 'Peguei ' + emReais(achados[0].centavos) + '. Confira — se errou, toque no certo:'
          : 'Peguei ' + emReais(achados[0].centavos) + '. Confira antes de salvar.');
        desenharOpcoes(achados);
        // sem isto o campo preenchido fica abaixo da dobra e parece que nada aconteceu
        if (cfg.campo) {
          setTimeout(function () {
            $(cfg.campo).scrollIntoView({ block: 'nearest' });
          }, 80);
        }
      }).catch(function () {
        mostrarEstado('Não consegui ler a foto. Digite o valor abaixo.');
      }).then(function () {
        ocupado = false;
        botao.disabled = false;
      });
    }

    botao.addEventListener('click', executar);

    return {
      // some quando não há foto, ou quando o navegador não permite a leitura
      atualizar: function () {
        botao.hidden = !(cfg.foto.temFoto() && Leitor.disponivel());
      },
      esconder: function () {
        caixa.hidden = true;
        limparOpcoes();
        estado.textContent = '';
        botao.disabled = false;
        ocupado = false;
      }
    };
  }

  /* ---------------- ficha do produto ---------------- */

  var elFicha = $('ficha');
  var elFichaTitulo = $('ficha-titulo');
  var elFichaSubtotal = $('ficha-subtotal');
  var elCampoPreco = $('campo-preco');
  var elCampoNome = $('campo-nome');
  var elCampoQtd = $('campo-qtd');
  var elCategorias = $('campo-categorias');
  var elBtnSalvar = $('btn-salvar');

  var fotoProduto = controladorDeFoto({
    previa: 'foto-previa', img: 'foto-img', remover: 'btn-remover-foto',
    botaoCamera: 'btn-camera', botaoGaleria: 'btn-galeria',
    entradaCamera: 'entrada-camera', entradaGaleria: 'entrada-galeria',
    aoMudar: function () { leitorProduto.atualizar(); },
    aoChegarFoto: function () { leitorProduto.esconder(); leitorProduto.atualizar(); }
  });

  var leitorProduto = criarLeitor({
    botao: 'btn-ler-preco', caixa: 'leitor-produto',
    estado: 'leitor-produto-estado', opcoes: 'leitor-produto-opcoes',
    foto: fotoProduto, tipo: 'etiqueta', campo: 'campo-preco',
    aoEscolher: function (centavos) {
      rascunho.precoCent = centavos;
      elCampoPreco.value = emReais(centavos);
      atualizarSubtotal();
    }
  });

  function desenharCategorias() {
    elCategorias.textContent = '';
    CATEGORIAS.forEach(function (c) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.categoria = c.id;
      chip.textContent = c.emoji + ' ' + c.nome;
      chip.addEventListener('click', function () {
        rascunho.categoria = c.id;
        marcarCategoria();
      });
      elCategorias.appendChild(chip);
    });
  }

  function marcarCategoria() {
    Array.prototype.forEach.call(elCategorias.children, function (chip) {
      chip.classList.toggle('chip-ativo', chip.dataset.categoria === rascunho.categoria);
    });
  }

  function abrirFicha(item) {
    rascunho = item
      ? Object.assign({}, item)
      : {
          id: null, nome: '', precoCent: 0, qtd: 1, marcado: false,
          categoria: CATEGORIA_PADRAO, foto: null
        };

    elFichaTitulo.textContent = item ? 'Editar produto' : 'Novo produto';
    elBtnSalvar.textContent = item ? 'Salvar' : 'Adicionar à lista';
    elCampoNome.value = rascunho.nome || '';
    elCampoPreco.value = emReais(rascunho.precoCent);
    elCampoQtd.textContent = String(rascunho.qtd);
    fotoProduto.definir(rascunho.foto);
    marcarCategoria();
    leitorProduto.esconder();
    leitorProduto.atualizar();
    atualizarSubtotal();

    elFicha.showModal();
    // Abre já no preço: é o que quase sempre muda.
    setTimeout(function () { elCampoPreco.focus(); elCampoPreco.select(); }, 60);
  }

  function atualizarSubtotal() {
    elFichaSubtotal.textContent = 'Subtotal: ' + emReais(rascunho.precoCent * rascunho.qtd);
  }

  function mudarQtd(delta) {
    rascunho.qtd = Math.min(99, Math.max(1, rascunho.qtd + delta));
    elCampoQtd.textContent = String(rascunho.qtd);
    atualizarSubtotal();
  }

  function salvarProduto(evento) {
    evento.preventDefault();

    rascunho.nome = elCampoNome.value.trim();
    rascunho.precoCent = centavosDoTexto(elCampoPreco.value);
    rascunho.foto = fotoProduto.obter();

    if (!rascunho.precoCent && !rascunho.nome && !rascunho.foto) {
      avisar('Coloque ao menos a foto, o nome ou o preço.');
      return;
    }

    var novo = !rascunho.id;
    if (novo) {
      rascunho.id = String(Date.now()) + Math.random().toString(16).slice(2, 8);
      rascunho.criadoEm = Date.now();
    }
    // carimbo de alteração: é por ele que a nuvem decide quem mexeu por último
    rascunho.atualizadoEm = Date.now();

    var paraGravar = rascunho;
    Dados.gravar(paraGravar).then(function () {
      var i = itens.findIndex(function (x) { return x.id === paraGravar.id; });
      if (i >= 0) {
        soltarUrl(urls.get(paraGravar.id), itens[i].foto);
        urls.delete(paraGravar.id);
        itens[i] = paraGravar;
      } else {
        itens.push(paraGravar);
      }
      // a URL já criada para a prévia passa a servir a lista, em vez de gerar outra
      var url = fotoProduto.entregarUrl();
      if (url) urls.set(paraGravar.id, url);

      rascunho = null;
      if (elFicha.open) elFicha.close();
      desenhar();
      Nuvem.agendar();
      avisar(novo ? 'Adicionado à lista.' : 'Produto atualizado.');
    }).catch(function () {
      avisar('Não consegui salvar. O aparelho pode estar sem espaço.');
    });
  }

  /* ---------------- lista ---------------- */

  var elLista = $('lista');
  var elVazio = $('vazio');
  var elTotal = $('total');
  var elResumo = $('resumo');

  function icone(caminho) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + caminho + '"/></svg>';
  }

  var ICONE_OK = 'M5 12.5l4.2 4.2L19 7';
  var ICONE_CIRCULO = 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z';
  var ICONE_LIXO = 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2';
  var ICONE_FOTO = 'M3 8a2 2 0 0 1 2-2h2l1.2-2h7.6L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z';

  function linha(item) {
    var li = document.createElement('li');
    li.className = 'item';
    li.dataset.id = item.id;
    li.dataset.marcado = item.marcado ? 'true' : 'false';

    var url = urls.get(item.id);
    if (!url && item.foto) {
      url = fonteDaFoto(item.foto);
      urls.set(item.id, url);
    }

    // O valor já aparece grande à direita: repetir o preço unitário só encurtava o
    // nome da categoria com reticências. Só vale a pena quando há mais de uma peça.
    var cat = categoria(item.categoria);
    var detalhe = cat.emoji + ' ' + cat.nome +
      (item.qtd > 1 ? ' · ' + item.qtd + ' × ' + emReais(item.precoCent) : '');

    li.innerHTML =
      '<button type="button" class="item-foto" data-acao="ver">' +
        (url ? '<img src="' + url + '" alt="" />' : icone(ICONE_FOTO)) +
      '</button>' +
      '<div class="item-info" data-acao="editar">' +
        '<p class="item-nome">' + textoSeguro(item.nome || 'Produto') + '</p>' +
        '<p class="item-detalhe">' + textoSeguro(detalhe) + '</p>' +
      '</div>' +
      '<div class="item-lado">' +
        '<span class="item-valor">' + emReais(item.precoCent * item.qtd) + '</span>' +
        '<button type="button" class="icone item-check" data-acao="marcar" ' +
          'aria-label="Marcar como pego" aria-pressed="' + (item.marcado ? 'true' : 'false') + '">' +
          icone(item.marcado ? ICONE_OK : ICONE_CIRCULO) +
        '</button>' +
        '<button type="button" class="icone item-apagar" data-acao="apagar" aria-label="Remover">' +
          icone(ICONE_LIXO) +
        '</button>' +
      '</div>';

    return li;
  }

  function desenhar() {
    itens.sort(function (a, b) { return (b.criadoEm || 0) - (a.criadoEm || 0); });

    elLista.textContent = '';
    itens.forEach(function (item) { elLista.appendChild(linha(item)); });
    elVazio.hidden = itens.length > 0;

    var pecas = itens.reduce(function (s, i) { return s + i.qtd; }, 0);
    var pegos = itens.filter(function (i) { return i.marcado; }).length;

    elTotal.textContent = emReais(totalDaLista());
    elResumo.textContent = itens.length
      ? pecas + (pecas > 1 ? ' itens' : ' item') + (pegos ? ' · ' + pegos + ' no carrinho' : '')
      : 'nenhum item';
  }

  /* Apagar não some com o registro: deixa uma lápide (`apagado: true`) no lugar.
     Sem ela, a exclusão feita num celular seria desfeita pelo outro na sincronização
     seguinte — o item ainda existiria lá e voltaria como novidade. A lápide guarda só
     o id e a data; nome, preço e foto vão embora e liberam espaço. */
  function apagarItem(item) {
    var lapide = {
      id: item.id,
      criadoEm: item.criadoEm || 0,
      atualizadoEm: Date.now(),
      apagado: true,
      nome: '', precoCent: 0, qtd: 1, marcado: false,
      categoria: CATEGORIA_PADRAO, foto: null, fotoArquivo: null
    };
    return Dados.gravar(lapide).then(function () {
      soltarUrl(urls.get(item.id), item.foto);
      urls.delete(item.id);
      itens = itens.filter(function (x) { return x.id !== item.id; });
    });
  }

  function aoClicarNaLista(evento) {
    var alvo = evento.target.closest('[data-acao]');
    var li = evento.target.closest('.item');
    if (!alvo || !li) return;

    var item = itens.find(function (x) { return x.id === li.dataset.id; });
    if (!item) return;

    var acao = alvo.dataset.acao;

    if (acao === 'editar') {
      abrirFicha(item);
    } else if (acao === 'ver') {
      if (item.foto) abrirVisor(item);
      else abrirFicha(item);
    } else if (acao === 'marcar') {
      item.marcado = !item.marcado;
      item.atualizadoEm = Date.now();
      Dados.gravar(item).then(function () {
        desenhar();
        Nuvem.agendar();
      });
    } else if (acao === 'apagar') {
      apagarItem(item).then(function () {
        desenhar();
        Nuvem.agendar();
        avisar('Item removido.');
      });
    }
  }

  /* ---------------- resumo por categoria ---------------- */

  var elResumoDlg = $('resumo-dlg');
  var elResumoCorpo = $('resumo-corpo');

  function porCategoria() {
    var mapa = new Map();
    itens.forEach(function (i) {
      var cat = categoria(i.categoria);
      var linha = mapa.get(cat.id) || { cat: cat, pecas: 0, produtos: 0, valorCent: 0 };
      linha.pecas += i.qtd;
      linha.produtos += 1;
      linha.valorCent += i.precoCent * i.qtd;
      mapa.set(cat.id, linha);
    });
    return Array.from(mapa.values()).sort(function (a, b) {
      return b.valorCent - a.valorCent;
    });
  }

  function blocoConferencia(totalNotaCent) {
    var lista = totalDaLista();
    var dif = totalNotaCent - lista;
    var bate = dif === 0;
    var classe = bate ? 'ok' : (dif > 0 ? 'alto' : 'baixo');
    var recado = bate
      ? 'Bateu certinho.'
      : (dif > 0
          ? 'A nota veio ' + emReais(dif) + ' <b>mais cara</b> que a sua lista.'
          : 'A nota veio ' + emReais(-dif) + ' <b>mais barata</b> que a sua lista.');

    return '<div class="conferencia-bloco ' + classe + '">' +
      '<div class="conferencia-linha"><span>Sua lista</span><strong>' + emReais(lista) + '</strong></div>' +
      '<div class="conferencia-linha"><span>Nota fiscal</span><strong>' + emReais(totalNotaCent) + '</strong></div>' +
      '<div class="conferencia-linha destaque"><span>Diferença</span><strong>' +
        (dif > 0 ? '+' : dif < 0 ? '−' : '') + emReais(Math.abs(dif)) + '</strong></div>' +
      '<p class="conferencia-recado">' + recado + '</p>' +
    '</div>';
  }

  function abrirResumo() {
    var total = totalDaLista();
    var pecas = itens.reduce(function (s, i) { return s + i.qtd; }, 0);
    var pegos = itens.reduce(function (s, i) { return s + (i.marcado ? i.qtd : 0); }, 0);

    var html =
      '<div class="resumo-cabeca">' +
        '<div><span>Total</span><strong>' + emReais(total) + '</strong></div>' +
        '<div><span>Itens</span><strong>' + pecas + '</strong></div>' +
        '<div><span>No carrinho</span><strong>' + pegos + '</strong></div>' +
      '</div>';

    var grupos = porCategoria();
    if (!grupos.length) {
      html += '<p class="dica">Sua lista ainda está vazia.</p>';
    } else {
      html += '<h3 class="resumo-titulo">Por categoria</h3><ul class="resumo-lista">';
      grupos.forEach(function (g) {
        var fatia = total ? Math.round((g.valorCent / total) * 100) : 0;
        html += '<li class="resumo-item">' +
          '<div class="resumo-item-topo">' +
            '<span class="resumo-item-nome">' + g.cat.emoji + ' ' + textoSeguro(g.cat.nome) + '</span>' +
            '<span class="resumo-item-valor">' + emReais(g.valorCent) + '</span>' +
          '</div>' +
          '<div class="resumo-barra"><span style="width:' + fatia + '%"></span></div>' +
          '<div class="resumo-item-baixo">' +
            '<span>' + g.pecas + (g.pecas > 1 ? ' itens' : ' item') + '</span>' +
            '<span>' + fatia + '% da compra</span>' +
          '</div>' +
        '</li>';
      });
      html += '</ul>';
    }

    if (nota && nota.totalCent) {
      html += '<h3 class="resumo-titulo">Conferência da nota</h3>' + blocoConferencia(nota.totalCent);
    }

    elResumoCorpo.innerHTML = html;
    elResumoDlg.showModal();
  }

  /* ---------------- nota fiscal ---------------- */

  var elNotaDlg = $('nota-dlg');
  var elNotaTotal = $('nota-total');
  var elNotaConferencia = $('nota-conferencia');
  var elNotaApagar = $('nota-apagar');

  var fotoNota = controladorDeFoto({
    previa: 'nota-previa', img: 'nota-img', remover: 'nota-remover-foto',
    botaoCamera: 'nota-camera', botaoGaleria: 'nota-galeria',
    entradaCamera: 'nota-entrada-camera', entradaGaleria: 'nota-entrada-galeria',
    aoMudar: function () { leitorNota.atualizar(); },
    aoChegarFoto: function () { leitorNota.esconder(); leitorNota.atualizar(); }
  });

  var leitorNota = criarLeitor({
    botao: 'btn-ler-nota', caixa: 'leitor-nota',
    estado: 'leitor-nota-estado', opcoes: 'leitor-nota-opcoes',
    foto: fotoNota, tipo: 'nota', campo: 'nota-total',
    aoEscolher: function (centavos) {
      elNotaTotal.value = emReais(centavos);
      atualizarConferencia();
    }
  });

  function atualizarConferencia() {
    var totalNota = centavosDoTexto(elNotaTotal.value);
    elNotaConferencia.innerHTML = totalNota
      ? blocoConferencia(totalNota)
      : '<p class="dica">Coloque o total da nota para eu comparar com a sua lista.</p>';
  }

  function abrirNota() {
    fotoNota.definir(nota ? nota.foto : null);
    elNotaTotal.value = emReais(nota ? nota.totalCent : 0);
    elNotaApagar.hidden = !nota;
    leitorNota.esconder();
    leitorNota.atualizar();
    atualizarConferencia();
    elNotaDlg.showModal();
  }

  function salvarNota(evento) {
    evento.preventDefault();

    var totalCent = centavosDoTexto(elNotaTotal.value);
    var foto = fotoNota.obter();

    if (!totalCent && !foto) {
      avisar('Coloque a foto da nota ou o total dela.');
      return;
    }

    var nova = {
      foto: foto, totalCent: totalCent,
      quando: Date.now(), atualizadoEm: Date.now(),
      fotoArquivo: null
    };
    Dados.gravarNota(nova).then(function () {
      nota = nova;
      fotoNota.soltar();
      if (elNotaDlg.open) elNotaDlg.close();
      Nuvem.agendar();
      var dif = totalCent - totalDaLista();
      avisar(!totalCent ? 'Nota guardada.'
        : dif === 0 ? 'Nota guardada — bateu certinho.'
        : 'Nota guardada — diferença de ' + emReais(Math.abs(dif)) + '.');
    }).catch(function () {
      avisar('Não consegui guardar a nota.');
    });
  }

  function apagarNota() {
    if (!window.confirm('Apagar a nota fiscal guardada?')) return;
    Dados.gravarNota(null).then(function () {
      nota = null;
      fotoNota.definir(null);
      elNotaTotal.value = emReais(0);
      elNotaApagar.hidden = true;
      atualizarConferencia();
      avisar('Nota apagada.');
    });
  }

  /* ---------------- sincronização ---------------- */

  var elNuvemDlg = $('nuvem-dlg');
  var elNuvemBotao = $('btn-nuvem');
  var elNuvemEstado = $('nuvem-estado');
  var elNuvemDono = $('nuvem-dono');
  var elNuvemRepo = $('nuvem-repo');
  var elNuvemToken = $('nuvem-token');
  var elNuvemSalvar = $('nuvem-salvar');
  var elNuvemDesligar = $('nuvem-desligar');

  var RECADOS = {
    desligada: 'Desligada — a lista está só neste aparelho.',
    parada: 'Conectada. Ainda não sincronizei nesta sessão.',
    sincronizando: 'Sincronizando…',
    offline: 'Sem internet — sincronizo quando voltar.',
    ok: 'Tudo sincronizado.',
    erro: 'Não consegui sincronizar.'
  };

  function horaCurta(quando) {
    if (!quando) return '';
    var d = new Date(quando);
    return (' às ' + String(d.getHours()).padStart(2, '0') + ':' +
            String(d.getMinutes()).padStart(2, '0'));
  }

  function pintarEstado(e) {
    elNuvemBotao.dataset.situacao = e.situacao;

    var texto = e.recado || RECADOS[e.situacao] || '';
    if (e.situacao === 'ok') texto = 'Tudo sincronizado' + horaCurta(e.quando) + '.';
    elNuvemBotao.title = texto;

    if (elNuvemEstado) {
      elNuvemEstado.dataset.situacao = e.situacao;
      elNuvemEstado.textContent = texto;
    }
  }

  function abrirNuvem() {
    var cfg = Nuvem.lerConfig();
    // o repositório deste projeto já vem preenchido: é o banco da família
    elNuvemDono.value = (cfg && cfg.dono) || 'Djonathan-DA';
    elNuvemRepo.value = (cfg && cfg.repo) || 'compras-familia-dados';
    elNuvemToken.value = (cfg && cfg.token) || '';
    elNuvemDesligar.hidden = !cfg;
    elNuvemSalvar.textContent = cfg ? 'Salvar e sincronizar' : 'Conectar';
    pintarEstado(Nuvem.estado());
    elNuvemDlg.showModal();
  }

  function conectarNuvem(evento) {
    evento.preventDefault();

    var cfg = {
      dono: elNuvemDono.value.trim(),
      repo: elNuvemRepo.value.trim(),
      ramo: 'main',
      token: elNuvemToken.value.trim()
    };

    if (!cfg.dono || !cfg.repo || !cfg.token) {
      avisar('Preencha o dono, o repositório e o token.');
      return;
    }

    elNuvemSalvar.disabled = true;
    elNuvemEstado.dataset.situacao = 'sincronizando';
    elNuvemEstado.textContent = 'Conferindo o token…';

    // testa antes de guardar, para não ficar um token quebrado salvo no aparelho
    Nuvem.testar(cfg).then(function () {
      Nuvem.gravarConfig(cfg);
      return Nuvem.sincronizar();
    }).then(function (r) {
      if (!r.ok) throw new Error(r.motivo || 'não consegui sincronizar');
      return recarregarDaNuvem();
    }).then(function () {
      if (elNuvemDlg.open) elNuvemDlg.close();
      avisar('Conectado. Lista sincronizada.');
    }).catch(function (erro) {
      elNuvemEstado.dataset.situacao = 'erro';
      elNuvemEstado.textContent = (erro && erro.message) || 'Não consegui conectar.';
    }).then(function () {
      elNuvemSalvar.disabled = false;
    });
  }

  function desligarNuvem() {
    if (!window.confirm('Desligar a sincronização neste aparelho? A lista continua aqui.')) return;
    Nuvem.gravarConfig(null);
    elNuvemToken.value = '';
    elNuvemDesligar.hidden = true;
    elNuvemSalvar.textContent = 'Conectar';
    avisar('Sincronização desligada.');
  }

  /* ---------------- visor de foto ---------------- */

  var elVisor = $('visor');
  var elVisorImg = $('visor-img');

  function abrirVisor(item) {
    elVisorImg.src = urls.get(item.id) || fonteDaFoto(item.foto);
    elVisorImg.alt = item.nome || 'Foto do produto';
    elVisor.showModal();
  }

  /* ---------------- compartilhar / limpar ---------------- */

  function textoDaLista() {
    var linhas = ['🛒 Compras'];
    itens.slice().reverse().forEach(function (i) {
      var cat = categoria(i.categoria);
      var qtd = i.qtd > 1 ? ' (' + i.qtd + 'x)' : '';
      linhas.push((i.marcado ? '✅ ' : '• ') + cat.emoji + ' ' +
                  (i.nome || 'Produto') + qtd + ' — ' + emReais(i.precoCent * i.qtd));
    });

    linhas.push('');
    porCategoria().forEach(function (g) {
      linhas.push(g.cat.emoji + ' ' + g.cat.nome + ': ' + g.pecas +
                  (g.pecas > 1 ? ' itens' : ' item') + ' — ' + emReais(g.valorCent));
    });

    linhas.push('');
    linhas.push('Total: ' + emReais(totalDaLista()));
    if (nota && nota.totalCent) {
      var dif = nota.totalCent - totalDaLista();
      linhas.push('Nota fiscal: ' + emReais(nota.totalCent) +
                  (dif === 0 ? ' (bateu)' : ' (diferença de ' + emReais(Math.abs(dif)) + ')'));
    }
    return linhas.join('\n');
  }

  function compartilhar() {
    if (!itens.length) { avisar('A lista está vazia.'); return; }
    var texto = textoDaLista();

    if (navigator.share) {
      navigator.share({ title: 'Compras', text: texto }).catch(function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto)
        .then(function () { avisar('Lista copiada.'); })
        .catch(function () { avisar('Não consegui copiar.'); });
      return;
    }
    window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank', 'noopener');
  }

  function limpar() {
    if (!itens.length) { avisar('A lista já está vazia.'); return; }
    if (!window.confirm('Apagar todos os ' + itens.length + ' itens da lista?')) return;

    // um a um, virando lápide, para a limpeza chegar também ao outro celular
    Promise.all(itens.slice().map(apagarItem)).then(function () {
      desenhar();
      Nuvem.agendar(1500);
      avisar('Lista limpa.');
    });
  }

  /* ---------------- ligações ---------------- */

  $('btn-adicionar').addEventListener('click', function () { abrirFicha(null); });
  $('btn-compartilhar').addEventListener('click', compartilhar);
  $('btn-limpar').addEventListener('click', limpar);
  $('btn-resumo').addEventListener('click', abrirResumo);
  $('btn-nota').addEventListener('click', abrirNota);
  elLista.addEventListener('click', aoClicarNaLista);

  $('form-produto').addEventListener('submit', salvarProduto);
  $('btn-fechar').addEventListener('click', function () { elFicha.close(); });
  elFicha.addEventListener('close', function () {
    fotoProduto.soltar();
    rascunho = null;
  });

  elCampoPreco.addEventListener('input', function () {
    rascunho.precoCent = centavosDoTexto(elCampoPreco.value);
    elCampoPreco.value = emReais(rascunho.precoCent);
    atualizarSubtotal();
  });
  elCampoPreco.addEventListener('focus', function () {
    // o cursor sempre no fim, senão os dígitos entram no meio do valor
    setTimeout(function () {
      var fim = elCampoPreco.value.length;
      elCampoPreco.setSelectionRange(fim, fim);
    }, 0);
  });

  $('btn-menos').addEventListener('click', function () { mudarQtd(-1); });
  $('btn-mais').addEventListener('click', function () { mudarQtd(1); });

  $('resumo-fechar').addEventListener('click', function () { elResumoDlg.close(); });
  $('resumo-ok').addEventListener('click', function () { elResumoDlg.close(); });

  $('form-nota').addEventListener('submit', salvarNota);
  $('nota-fechar').addEventListener('click', function () { elNotaDlg.close(); });
  elNotaApagar.addEventListener('click', apagarNota);
  elNotaDlg.addEventListener('close', function () { fotoNota.soltar(); });
  elNotaTotal.addEventListener('input', function () {
    elNotaTotal.value = emReais(centavosDoTexto(elNotaTotal.value));
    atualizarConferencia();
  });

  $('btn-nuvem').addEventListener('click', abrirNuvem);
  $('form-nuvem').addEventListener('submit', conectarNuvem);
  $('nuvem-fechar').addEventListener('click', function () { elNuvemDlg.close(); });
  elNuvemDesligar.addEventListener('click', desligarNuvem);
  Nuvem.aoMudar(pintarEstado);

  $('visor-fechar').addEventListener('click', function () { elVisor.close(); });
  elVisor.addEventListener('click', function (e) {
    if (e.target === elVisor) elVisor.close();
  });
  elVisor.addEventListener('close', function () { elVisorImg.removeAttribute('src'); });

  /* ---------------- início ---------------- */

  desenharCategorias();

  function carregar() {
    return Dados.listar().then(function (guardados) {
      itens = (guardados || []).filter(function (i) {
        return !i.apagado;                    // lápides existem só para a sincronização
      }).map(function (i) {
        return {
          id: i.id,
          nome: i.nome || '',
          precoCent: i.precoCent || 0,
          qtd: i.qtd || 1,
          marcado: !!i.marcado,
          categoria: i.categoria || CATEGORIA_PADRAO,
          criadoEm: i.criadoEm || 0,
          atualizadoEm: i.atualizadoEm || i.criadoEm || 0,
          fotoArquivo: i.fotoArquivo || null,
          foto: i.foto || null
        };
      });
      desenhar();
      return Dados.lerNota();
    }).then(function (guardada) {
      nota = guardada || null;
    });
  }

  // Redesenha a tela com o que a sincronização trouxe do outro celular.
  function recarregarDaNuvem() {
    urls.forEach(function (url, id) {
      var item = itens.find(function (x) { return x.id === id; });
      soltarUrl(url, item && item.foto);
    });
    urls.clear();
    return carregar();
  }

  carregar().then(function () {
    if (Nuvem.ligada()) {
      return Nuvem.sincronizar().then(function (r) {
        if (r.ok) return recarregarDaNuvem();
      });
    }
  }).catch(function () {
    desenhar();
    avisar('Não consegui abrir a lista guardada.');
  });

  window.addEventListener('online', function () {
    if (Nuvem.ligada()) {
      Nuvem.sincronizar().then(function (r) { if (r.ok) recarregarDaNuvem(); });
    }
  });

  // Ao voltar para o app, busca o que a outra pessoa fez enquanto ele estava fechado.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Nuvem.ligada()) {
      Nuvem.sincronizar().then(function (r) { if (r.ok) recarregarDaNuvem(); });
    }
  });

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
