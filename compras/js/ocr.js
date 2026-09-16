/* Leitura de preço na foto (etiqueta do produto e nota fiscal).

   O motor (Tesseract) está embutido em vendor/ocr/ — nada vem de CDN. Ele só é
   carregado quando o usuário pede para ler uma foto, e o service worker guarda os
   arquivos depois da primeira vez, então da segunda em diante funciona offline.

   O que sai daqui é sempre SUGESTÃO: quem confirma o valor é o usuário. */

(function (global) {
  'use strict';

  var BASE = 'vendor/ocr/';
  var LADO_OCR = 1600;   // px — texto pequeno demais o motor não lê

  // Bytes de um módulo WebAssembly que só valida onde há SIMD (iOS 16.4+).
  var TESTE_SIMD = new Uint8Array([
    0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123,
    3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11
  ]);

  function temSimd() {
    try {
      return typeof WebAssembly === 'object' && WebAssembly.validate(TESTE_SIMD);
    } catch (e) {
      return false;
    }
  }

  function caminhoDoNucleo() {
    return BASE + 'core/tesseract-core' + (temSimd() ? '-simd' : '') + '-lstm.wasm.js';
  }

  /* ---------------- carregamento sob demanda ---------------- */

  var promessaScript = null;

  function carregarScript() {
    if (promessaScript) return promessaScript;
    promessaScript = new Promise(function (resolve, reject) {
      if (global.Tesseract) return resolve(global.Tesseract);
      var tag = document.createElement('script');
      tag.src = BASE + 'tesseract.min.js';
      tag.onload = function () {
        global.Tesseract ? resolve(global.Tesseract) : reject(new Error('motor não subiu'));
      };
      tag.onerror = function () { reject(new Error('não consegui baixar o leitor')); };
      document.head.appendChild(tag);
    });
    return promessaScript;
  }

  var promessaMotor = null;

  function motor(aoProgredir) {
    if (promessaMotor) return promessaMotor;
    promessaMotor = carregarScript().then(function (Tesseract) {
      return Tesseract.createWorker('por', 1, {
        workerPath: BASE + 'worker.min.js',
        corePath: caminhoDoNucleo(),
        langPath: BASE + 'lang',
        gzip: true,
        logger: function (m) {
          if (aoProgredir && m && typeof m.progress === 'number') {
            aoProgredir(m.status, m.progress);
          }
        }
      });
    }).catch(function (erro) {
      promessaMotor = null;   // deixa tentar de novo depois
      throw erro;
    });
    return promessaMotor;
  }

  /* ---------------- preparo da imagem ---------------- */

  // O motor lê muito melhor em cinza e com bom contraste do que na foto crua.
  function prepararImagem(arquivo) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(arquivo);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);

        var escala = Math.min(1, LADO_OCR / Math.max(img.width, img.height));
        var tela = document.createElement('canvas');
        tela.width = Math.max(1, Math.round(img.width * escala));
        tela.height = Math.max(1, Math.round(img.height * escala));

        var ctx = tela.getContext('2d');
        ctx.drawImage(img, 0, 0, tela.width, tela.height);

        var dados = ctx.getImageData(0, 0, tela.width, tela.height);
        var p = dados.data;
        var i;

        // cinza + o menor e o maior tom, para esticar o contraste em seguida
        var min = 255, max = 0;
        for (i = 0; i < p.length; i += 4) {
          var cinza = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000;
          p[i] = p[i + 1] = p[i + 2] = cinza;
          if (cinza < min) min = cinza;
          if (cinza > max) max = cinza;
        }
        var faixa = max - min;
        if (faixa > 10) {
          for (i = 0; i < p.length; i += 4) {
            var v = (p[i] - min) * 255 / faixa;
            p[i] = p[i + 1] = p[i + 2] = v;
          }
        }
        ctx.putImageData(dados, 0, 0);
        resolve(tela);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('imagem inválida'));
      };
      img.src = url;
    });
  }

  /* ---------------- garimpo dos valores ---------------- */

  var PRECO = /(?:r\s*\$\s*)?(\d{1,4})\s*[.,]\s*(\d{2})(?!\d)/gi;

  function centavosDe(inteiro, decimal) {
    return parseInt(inteiro, 10) * 100 + parseInt(decimal, 10);
  }

  // Junta as palavras de uma linha e devolve os valores achados, com a altura do
  // texto: na etiqueta de gôndola o preço é sempre o número impresso maior.
  function valoresDaLinha(linha) {
    var texto = (linha.text || '').replace(/\s+/g, ' ').trim();
    if (!texto) return [];

    var alturas = (linha.words || []).map(function (w) {
      return w.bbox ? (w.bbox.y1 - w.bbox.y0) : 0;
    });
    var altura = alturas.length ? Math.max.apply(null, alturas) : 0;

    var achados = [];
    var m;
    PRECO.lastIndex = 0;
    while ((m = PRECO.exec(texto)) !== null) {
      var centavos = centavosDe(m[1], m[2]);
      if (centavos > 0 && centavos <= 9999999) {
        achados.push({
          centavos: centavos,
          altura: altura,
          confianca: linha.confidence || 0,
          texto: texto,
          temCifrao: /r\s*\$/i.test(m[0])
        });
      }
    }
    return achados;
  }

  function linhasDe(dados) {
    var linhas = [];
    (dados.blocks || []).forEach(function (bloco) {
      (bloco.paragraphs || []).forEach(function (par) {
        (par.lines || []).forEach(function (l) { linhas.push(l); });
      });
    });
    if (!linhas.length && dados.lines) linhas = dados.lines;
    return linhas;
  }

  // Mesmo valor lido em lugares diferentes vira uma entrada só: fica a de texto maior,
  // mas as marcas se somam — um 81,90 visto na linha do TOTAL continua sendo o total,
  // mesmo que a outra leitura dele estivesse em texto mais alto.
  function juntarIguais(lista) {
    var porValor = new Map();
    lista.forEach(function (v) {
      var atual = porValor.get(v.centavos);
      if (!atual) {
        porValor.set(v.centavos, v);
        return;
      }
      var melhor = v.altura > atual.altura ? v : atual;
      melhor.temCifrao = atual.temCifrao || v.temCifrao;
      melhor.ehTotal = atual.ehTotal || v.ehTotal;
      melhor.ehPagamento = atual.ehPagamento || v.ehPagamento;
      porValor.set(v.centavos, melhor);
    });
    return Array.from(porValor.values());
  }

  /* Modos de segmentação de página do Tesseract.
     O padrão do tesseract.js é 6 (bloco único) e ele SIMPLESMENTE DESCARTA o preço
     em corpo grande da etiqueta — a análise de layout trata o número gigante como
     figura. 11 (texto esparso) acha texto solto em qualquer canto, que é a cara de
     uma etiqueta de gôndola; 3 (automático) preserva as linhas, que é o que a nota
     fiscal precisa para a linha do TOTAL ser reconhecível. */
  var ESPARSO = '11';
  var AUTOMATICO = '3';
  var BLOCO = '6';   // cupom fiscal é exatamente isto: uma coluna única de texto

  function reconhecer(arquivo, modo, aoProgredir) {
    return prepararImagem(arquivo).then(function (tela) {
      return motor(aoProgredir).then(function (worker) {
        return worker.setParameters({ tessedit_pageseg_mode: modo })
          .then(function () { return worker.recognize(tela); });
      });
    }).then(function (saida) {
      return saida.data;
    });
  }

  // Uma segunda passada com o outro modo custa tempo só quando a primeira não achou nada.
  function reconhecerComReserva(arquivo, modo, reserva, aoProgredir, extrair) {
    return reconhecer(arquivo, modo, aoProgredir).then(function (dados) {
      var achados = extrair(dados);
      if (achados.length) return achados;
      return reconhecer(arquivo, reserva, aoProgredir).then(extrair);
    });
  }

  /* ---------------- interface pública ---------------- */

  global.Leitor = {
    // Precisa de Worker; em file:// o navegador bloqueia, então some o botão.
    disponivel: function () {
      return typeof Worker === 'function' &&
             typeof WebAssembly === 'object' &&
             location.protocol.indexOf('http') === 0;
    },

    /* Etiqueta do produto: devolve até 4 preços prováveis, o mais provável primeiro.
       Critério: altura do texto na foto (o preço é o número maior), depois o cifrão. */
    precosNaEtiqueta: function (arquivo, aoProgredir) {
      return reconhecerComReserva(arquivo, ESPARSO, AUTOMATICO, aoProgredir, function (dados) {
        var achados = [];
        linhasDe(dados).forEach(function (l) {
          achados = achados.concat(valoresDaLinha(l));
        });

        var maiorAltura = achados.reduce(function (m, v) {
          return Math.max(m, v.altura);
        }, 0) || 1;

        return juntarIguais(achados).map(function (v) {
          v.nota = (v.altura / maiorAltura) * 100 +
                   (v.temCifrao ? 25 : 0) +
                   (v.confianca / 10);
          return v;
        }).sort(function (a, b) {
          return b.nota - a.nota;
        }).slice(0, 4);
      });
    },

    /* Nota fiscal: procura a linha do TOTAL. "SUBTOTAL" e "TOTAL DE ITENS" não valem;
       sem linha de total, fica o maior valor da nota, que quase sempre é ele. */
    totalDaNota: function (arquivo, aoProgredir) {
      return reconhecerComReserva(arquivo, BLOCO, AUTOMATICO, aoProgredir, function (dados) {
        var achados = [];
        linhasDe(dados).forEach(function (l) {
          var texto = (l.text || '').toUpperCase();
          var ehTotal = /\bTOTAL\b/.test(texto) &&
                        !/SUBTOTAL|TOTAL\s*(DE\s*)?(ITENS|ITEM|QTD)/.test(texto);
          // o que o cliente entregou e recebeu de volta não é o total da compra,
          // e costuma ser o MAIOR número do cupom — sem isto vira o palpite errado
          var ehPagamento = /TROCO|DINHEIRO|RECEBIDO|CART[AÃ]O|CR[EÉ]DITO|D[EÉ]BITO|\bPIX\b/.test(texto);
          valoresDaLinha(l).forEach(function (v) {
            v.ehTotal = ehTotal;
            v.ehPagamento = ehPagamento;
            achados.push(v);
          });
        });

        var maior = achados.reduce(function (m, v) {
          return Math.max(m, v.centavos);
        }, 0) || 1;

        return juntarIguais(achados).map(function (v) {
          v.nota = (v.ehTotal ? 1000 : 0) -
                   (v.ehPagamento ? 500 : 0) +
                   (v.centavos / maior) * 100;
          return v;
        }).sort(function (a, b) {
          return b.nota - a.nota;
        }).slice(0, 4);
      });
    }
  };
})(window);
