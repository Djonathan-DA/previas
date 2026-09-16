/* Sincronização com o GitHub — o "banco de dados na nuvem" do app.

   Como funciona: a lista vira um arquivo `dados/lista.json` no próprio repositório, e
   cada foto vira um arquivo em `dados/fotos/<id>.jpg`. Dois celulares apontando para o
   mesmo repositório enxergam a mesma lista.

   O aparelho continua mandando: tudo é gravado primeiro no IndexedDB e só depois sobe.
   Sem internet o app funciona igual, e sincroniza na próxima vez que abrir.

   SEGURANÇA — o token fica SÓ no aparelho (localStorage), digitado por quem usa.
   Ele nunca é gravado no repositório, nunca aparece em arquivo do projeto e nunca é
   enviado para lugar nenhum além da própria API do GitHub. Se algum dia for preciso
   guardar configuração no repositório, o token não entra junto. */

(function (global) {
  'use strict';

  var CHAVE = 'compras:nuvem';
  var ARQUIVO = 'dados/lista.json';
  var PASTA_FOTOS = 'dados/fotos/';
  var API = 'https://api.github.com';
  var DIAS_TUMULO = 30;   // por quanto tempo uma exclusão continua se propagando

  var ouvintes = [];
  var estado = { situacao: 'desligada', quando: 0, recado: '' };
  var rodando = null;

  /* ---------------- configuração local ---------------- */

  function lerConfig() {
    try {
      var c = JSON.parse(global.localStorage.getItem(CHAVE) || 'null');
      if (!c || !c.token) return null;
      return {
        dono: c.dono || '', repo: c.repo || '',
        ramo: c.ramo || 'main', token: c.token
      };
    } catch (e) {
      return null;
    }
  }

  function gravarConfig(cfg) {
    if (!cfg) {
      global.localStorage.removeItem(CHAVE);
      anunciar('desligada', '');
      return;
    }
    global.localStorage.setItem(CHAVE, JSON.stringify({
      dono: cfg.dono.trim(), repo: cfg.repo.trim(),
      ramo: (cfg.ramo || 'main').trim(), token: cfg.token.trim()
    }));
    anunciar('parada', '');
  }

  function anunciar(situacao, recado, quando) {
    estado = {
      situacao: situacao,
      recado: recado || '',
      quando: quando || estado.quando
    };
    ouvintes.forEach(function (cb) { cb(estado); });
  }

  /* ---------------- conversas com a API ---------------- */

  function paraBase64(texto) {
    var bytes = new TextEncoder().encode(texto);
    var bruto = '';
    for (var i = 0; i < bytes.length; i++) bruto += String.fromCharCode(bytes[i]);
    return global.btoa(bruto);
  }

  function deBase64(b64) {
    var bruto = global.atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bruto.length);
    for (var i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function blobParaBase64(blob) {
    return new Promise(function (resolve, reject) {
      var leitor = new FileReader();
      leitor.onload = function () {
        resolve(String(leitor.result).split(',')[1]);
      };
      leitor.onerror = function () { reject(new Error('não consegui ler a foto')); };
      leitor.readAsDataURL(blob);
    });
  }

  function url(cfg, caminho) {
    return API + '/repos/' + encodeURIComponent(cfg.dono) + '/' +
           encodeURIComponent(cfg.repo) + '/contents/' + caminho;
  }

  function pedir(cfg, caminho, opcoes) {
    opcoes = opcoes || {};
    return fetch(url(cfg, caminho) + (opcoes.busca || ''), {
      method: opcoes.metodo || 'GET',
      headers: {
        'Authorization': 'Bearer ' + cfg.token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined
    }).then(function (r) {
      if (r.status === 404) return { ausente: true };
      if (r.status === 401) throw new Error('Token inválido ou expirado.');
      if (r.status === 403) throw new Error('O token não tem permissão de escrita neste repositório.');
      if (r.status === 409 || r.status === 422) {
        var e = new Error('conflito');
        e.conflito = true;
        throw e;
      }
      if (!r.ok) throw new Error('GitHub respondeu ' + r.status + '.');
      return r.json();
    });
  }

  function baixarArquivo(cfg, caminho) {
    return pedir(cfg, caminho, { busca: '?ref=' + encodeURIComponent(cfg.ramo) });
  }

  function subirArquivo(cfg, caminho, conteudoB64, sha, mensagem) {
    return pedir(cfg, caminho, {
      metodo: 'PUT',
      corpo: {
        message: mensagem,
        content: conteudoB64,
        branch: cfg.ramo,
        sha: sha || undefined
      }
    });
  }

  /* ---------------- junção das duas pontas ---------------- */

  function carimbo(item) {
    return item.atualizadoEm || item.criadoEm || 0;
  }

  /* Ganha quem mexeu por último, item por item — não o aparelho que sincronizou por
     último. Sem isso, quem abrisse o app depois apagaria o que o outro acabou de fazer. */
  function juntarItens(locais, remotos) {
    var mapa = new Map();
    locais.forEach(function (i) { mapa.set(i.id, i); });

    remotos.forEach(function (r) {
      var l = mapa.get(r.id);
      if (!l || carimbo(r) > carimbo(l)) mapa.set(r.id, r);
    });

    var corte = Date.now() - DIAS_TUMULO * 24 * 60 * 60 * 1000;
    return Array.from(mapa.values()).filter(function (i) {
      // exclusões antigas param de trafegar, senão o arquivo só cresce
      return !(i.apagado && carimbo(i) < corte);
    });
  }

  // O que vai para o JSON: sem Blob de foto, só o caminho do arquivo dela no repositório.
  function paraNuvem(item) {
    return {
      id: item.id,
      listaId: item.listaId || null,
      nome: item.nome || '',
      precoCent: item.precoCent || 0,
      qtd: item.qtd || 1,
      marcado: !!item.marcado,
      categoria: item.categoria || 'outros',
      criadoEm: item.criadoEm || 0,
      atualizadoEm: carimbo(item),
      apagado: !!item.apagado,
      fotoArquivo: item.fotoArquivo || null
    };
  }

  function notaParaNuvem(nota) {
    if (!nota) return null;
    return {
      totalCent: nota.totalCent || 0,
      descontoCent: nota.descontoCent || 0,
      pagoCent: nota.pagoCent || 0,
      qtdItens: nota.qtdItens || null,
      produtos: nota.produtos || [],
      quando: nota.quando || 0,
      atualizadoEm: nota.atualizadoEm || nota.quando || 0,
      fotoArquivo: nota.fotoArquivo || null
    };
  }

  // A lista (a ida ao mercado) leva a nota junto; a foto da nota vai por caminho.
  function listaParaNuvem(l) {
    return {
      id: l.id,
      mercado: l.mercado || '',
      criadoEm: l.criadoEm || 0,
      atualizadoEm: carimbo(l),
      apagado: !!l.apagado,
      nota: notaParaNuvem(l.nota)
    };
  }

  function juntarListas(locais, remotas) {
    var mapa = new Map();
    locais.forEach(function (l) { mapa.set(l.id, l); });
    remotas.forEach(function (r) {
      var l = mapa.get(r.id);
      if (!l || carimbo(r) > carimbo(l)) {
        // nunca descartar a foto local da nota por causa de um registro remoto sem ela
        if (l && l.nota && l.nota.foto && r.nota && !r.nota.foto) r.nota.foto = l.nota.foto;
        mapa.set(r.id, r);
      }
    });
    return Array.from(mapa.values());
  }

  /* ---------------- fotos ---------------- */

  function caminhoDaFoto(id) {
    return PASTA_FOTOS + String(id).replace(/[^a-zA-Z0-9_-]/g, '') + '.jpg';
  }

  // Sobe só o que ainda não está lá: foto é gravada uma vez e nunca mais.
  function subirFotosPendentes(cfg, itens) {
    var pendentes = itens.filter(function (i) {
      return !i.apagado && i.foto && !i.fotoArquivo;
    });
    if (!pendentes.length) return Promise.resolve(false);

    var fila = Promise.resolve();
    var mudou = false;

    pendentes.forEach(function (item) {
      fila = fila.then(function () {
        var caminho = caminhoDaFoto(item.id);
        var comoBlob = item.foto instanceof Blob
          ? Promise.resolve(item.foto)
          : fetch(item.foto).then(function (r) { return r.blob(); });

        return comoBlob
          .then(blobParaBase64)
          .then(function (b64) {
            return subirArquivo(cfg, caminho, b64, null, 'Foto de ' + (item.nome || 'produto'));
          })
          .then(function () {
            item.fotoArquivo = caminho;
            mudou = true;
            return Dados.gravar(item);
          })
          .catch(function (e) {
            // uma foto que não sobe não pode derrubar a sincronização inteira
            if (e && e.conflito) item.fotoArquivo = caminho;
          });
      });
    });

    return fila.then(function () { return mudou; });
  }

  /* A foto da nota fiscal mora dentro da lista, então tem o seu próprio par de sobe/desce.
     Mesmo princípio do item: arquivo separado, enviado uma vez só. */
  function caminhoDaNota(id) {
    return PASTA_FOTOS + 'nota-' + String(id).replace(/[^a-zA-Z0-9_-]/g, '') + '.jpg';
  }

  function subirNotasPendentes(cfg, listas) {
    var pendentes = listas.filter(function (l) {
      return !l.apagado && l.nota && l.nota.foto && !l.nota.fotoArquivo;
    });
    if (!pendentes.length) return Promise.resolve();

    var fila = Promise.resolve();
    pendentes.forEach(function (l) {
      fila = fila.then(function () {
        var caminho = caminhoDaNota(l.id);
        var comoBlob = l.nota.foto instanceof Blob
          ? Promise.resolve(l.nota.foto)
          : fetch(l.nota.foto).then(function (r) { return r.blob(); });

        return comoBlob
          .then(blobParaBase64)
          .then(function (b64) {
            return subirArquivo(cfg, caminho, b64, null, 'Nota fiscal');
          })
          .then(function () {
            l.nota.fotoArquivo = caminho;
            return Dados.gravarLista(l);
          })
          .catch(function (e) {
            if (e && e.conflito) l.nota.fotoArquivo = caminho;
          });
      });
    });
    return fila;
  }

  function baixarNotasFaltando(cfg, listas) {
    var faltando = listas.filter(function (l) {
      return !l.apagado && l.nota && l.nota.fotoArquivo && !l.nota.foto;
    });
    if (!faltando.length) return Promise.resolve();

    var fila = Promise.resolve();
    faltando.forEach(function (l) {
      fila = fila.then(function () {
        return baixarArquivo(cfg, l.nota.fotoArquivo).then(function (r) {
          if (r.ausente || !r.content) return;
          var bruto = global.atob(String(r.content).replace(/\s/g, ''));
          var bytes = new Uint8Array(bruto.length);
          for (var i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
          l.nota.foto = new Blob([bytes], { type: 'image/jpeg' });
          return Dados.gravarLista(l);
        }).catch(function () { /* sem a foto a nota ainda serve */ });
      });
    });
    return fila;
  }

  // Baixa a foto de um item que chegou do outro celular.
  function baixarFotosFaltando(cfg, itens) {
    var faltando = itens.filter(function (i) {
      return !i.apagado && i.fotoArquivo && !i.foto;
    });
    if (!faltando.length) return Promise.resolve(false);

    var fila = Promise.resolve();
    var mudou = false;

    faltando.forEach(function (item) {
      fila = fila.then(function () {
        return baixarArquivo(cfg, item.fotoArquivo).then(function (r) {
          if (r.ausente || !r.content) return;
          var bruto = global.atob(String(r.content).replace(/\s/g, ''));
          var bytes = new Uint8Array(bruto.length);
          for (var i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
          item.foto = new Blob([bytes], { type: 'image/jpeg' });
          mudou = true;
          return Dados.gravar(item);
        }).catch(function () { /* sem a foto o item ainda serve */ });
      });
    });

    return fila.then(function () { return mudou; });
  }

  /* ---------------- a sincronização em si ---------------- */

  function umaRodada(cfg) {
    var locais, listasLocais;

    return Promise.all([Dados.listar(), Dados.listarListas()]).then(function (r) {
      locais = r[0] || [];
      return subirFotosPendentes(cfg, locais).then(function () {
        return subirNotasPendentes(cfg, r[1] || []);
      });
    }).then(function () {
      return Promise.all([Dados.listar(), Dados.listarListas(), baixarArquivo(cfg, ARQUIVO)]);
    }).then(function (r) {
      locais = r[0] || [];
      listasLocais = r[1] || [];
      var arquivo = r[2];

      var remoto = { itens: [], listas: [] };
      var sha = null;

      if (!arquivo.ausente && arquivo.content) {
        sha = arquivo.sha;
        try {
          var lido = JSON.parse(deBase64(arquivo.content));
          remoto.itens = lido.itens || [];
          remoto.listas = lido.listas || [];

          /* Arquivo da versão 1 (antes das listas): tinha uma nota solta e itens sem
             lista. Eles entram como estão — a migração local do app cuida de agrupar. */
          if (!lido.listas && lido.nota) remoto.notaAntiga = lido.nota;
        } catch (e) { /* arquivo estragado: vale o que está no aparelho */ }
      }

      var juntos = juntarItens(locais, remoto.itens);
      var listasFinais = juntarListas(listasLocais, remoto.listas);

      // grava no aparelho o que veio de fora
      var gravacoes = [];
      var porId = new Map();
      locais.forEach(function (i) { porId.set(i.id, i); });

      juntos.forEach(function (i) {
        var atual = porId.get(i.id);
        if (!atual || carimbo(i) > carimbo(atual)) {
          // a foto local nunca é descartada por causa de um registro remoto sem ela
          if (atual && atual.foto && !i.foto) i.foto = atual.foto;
          gravacoes.push(Dados.gravar(i));
        }
      });

      var listaPorId = new Map();
      listasLocais.forEach(function (l) { listaPorId.set(l.id, l); });
      listasFinais.forEach(function (l) {
        var atual = listaPorId.get(l.id);
        if (!atual || carimbo(l) > carimbo(atual)) gravacoes.push(Dados.gravarLista(l));
      });

      var corpo = {
        versao: 2,
        atualizadoEm: Date.now(),
        listas: listasFinais.map(listaParaNuvem),
        itens: juntos.map(paraNuvem)
      };
      var texto = JSON.stringify(corpo, null, 2) + '\n';

      return Promise.all(gravacoes).then(function () {
        return subirArquivo(cfg, ARQUIVO, paraBase64(texto), sha, 'Lista de compras');
      }).then(function () {
        return Promise.all([Dados.listar(), Dados.listarListas()]);
      }).then(function (finais) {
        return baixarFotosFaltando(cfg, finais[0] || []).then(function () {
          return baixarNotasFaltando(cfg, finais[1] || []);
        });
      });
    });
  }

  function sincronizar() {
    var cfg = lerConfig();
    if (!cfg || !cfg.dono || !cfg.repo) {
      anunciar('desligada', '');
      return Promise.resolve({ ok: false, motivo: 'desligada' });
    }
    if (rodando) return rodando;
    if (!navigator.onLine) {
      anunciar('offline', 'Sem internet — sincronizo quando voltar.');
      return Promise.resolve({ ok: false, motivo: 'offline' });
    }

    anunciar('sincronizando', '');

    rodando = umaRodada(cfg).catch(function (erro) {
      // conflito = o outro celular gravou no meio do caminho; refaz com o que chegou
      if (erro && erro.conflito) return umaRodada(cfg);
      throw erro;
    }).then(function () {
      anunciar('ok', '', Date.now());
      return { ok: true };
    }).catch(function (erro) {
      anunciar('erro', (erro && erro.message) || 'Não consegui sincronizar.');
      return { ok: false, motivo: (erro && erro.message) || 'erro' };
    }).then(function (r) {
      rodando = null;
      return r;
    });

    return rodando;
  }

  /* ---------------- interface pública ---------------- */

  var agendado = null;

  global.Nuvem = {
    ARQUIVO: ARQUIVO,
    lerConfig: lerConfig,
    gravarConfig: gravarConfig,
    ligada: function () { return !!lerConfig(); },
    estado: function () { return estado; },
    aoMudar: function (cb) { ouvintes.push(cb); cb(estado); },
    sincronizar: sincronizar,

    // junta as alterações de uma mesma ida ao mercado num envio só
    agendar: function (atraso) {
      if (!lerConfig()) return;
      clearTimeout(agendado);
      agendado = setTimeout(sincronizar, atraso || 4000);
    },

    // usado pela tela de configuração para conferir o token antes de salvar
    testar: function (cfg) {
      return fetch(API + '/repos/' + encodeURIComponent(cfg.dono) + '/' +
                   encodeURIComponent(cfg.repo), {
        headers: {
          'Authorization': 'Bearer ' + cfg.token,
          'Accept': 'application/vnd.github+json'
        }
      }).then(function (r) {
        if (r.status === 401) throw new Error('Token inválido ou expirado.');
        if (r.status === 404) throw new Error('Repositório não encontrado, ou o token não dá acesso a ele.');
        if (!r.ok) throw new Error('GitHub respondeu ' + r.status + '.');
        return r.json();
      }).then(function (repo) {
        if (!repo.permissions || !repo.permissions.push) {
          throw new Error('O token só tem leitura. Precisa de Contents: Read and write.');
        }
        return repo;
      });
    }
  };
})(window);
