/* Armazenamento local dos itens da lista.
   Backend principal: IndexedDB (foto guardada como Blob, sem limite prático).
   Reserva: localStorage (foto como data URL) para navegadores que bloqueiam o IndexedDB.
   Nada sai do aparelho — não há servidor nem login. */

(function (global) {
  'use strict';

  var BANCO = 'compras-familia';
  var VERSAO = 2;
  var TABELA = 'itens';
  var TABELA_CFG = 'config';     // guarda a nota fiscal da compra
  var CHAVE_LS = 'compras:itens';
  var CHAVE_LS_CFG = 'compras:config';

  /* ---------------- IndexedDB ---------------- */

  var conexao = null;

  function abrir() {
    if (conexao) return conexao;
    conexao = new Promise(function (resolve, reject) {
      if (!global.indexedDB) return reject(new Error('sem indexedDB'));
      var req = global.indexedDB.open(BANCO, VERSAO);
      req.onupgradeneeded = function () {
        var bd = req.result;
        if (!bd.objectStoreNames.contains(TABELA)) {
          bd.createObjectStore(TABELA, { keyPath: 'id' });
        }
        if (!bd.objectStoreNames.contains(TABELA_CFG)) {
          bd.createObjectStore(TABELA_CFG, { keyPath: 'chave' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('falha ao abrir')); };
      req.onblocked = function () { reject(new Error('bloqueado')); };
    });
    return conexao;
  }

  function transacao(modo, executar, tabela) {
    return abrir().then(function (bd) {
      return new Promise(function (resolve, reject) {
        var tx = bd.transaction(tabela || TABELA, modo);
        var pedido = executar(tx.objectStore(tabela || TABELA));
        tx.oncomplete = function () { resolve(pedido && pedido.result); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error || new Error('abortado')); };
      });
    });
  }

  var idb = {
    nome: 'indexeddb',
    listar: function () {
      return transacao('readonly', function (t) { return t.getAll(); });
    },
    gravar: function (item) {
      return transacao('readwrite', function (t) { return t.put(item); });
    },
    apagar: function (id) {
      return transacao('readwrite', function (t) { return t.delete(id); });
    },
    limpar: function () {
      return transacao('readwrite', function (t) { return t.clear(); });
    },
    lerCfg: function (chave) {
      return transacao('readonly', function (t) { return t.get(chave); }, TABELA_CFG)
        .then(function (r) { return r ? r.valor : null; });
    },
    gravarCfg: function (chave, valor) {
      return transacao('readwrite', function (t) {
        return valor === null ? t.delete(chave) : t.put({ chave: chave, valor: valor });
      }, TABELA_CFG);
    }
  };

  /* ---------------- reserva: localStorage ---------------- */

  function lerLS() {
    try {
      return JSON.parse(global.localStorage.getItem(CHAVE_LS) || '[]');
    } catch (e) {
      return [];
    }
  }

  function gravarLS(itens) {
    global.localStorage.setItem(CHAVE_LS, JSON.stringify(itens));
  }

  var ls = {
    nome: 'localstorage',
    listar: function () { return Promise.resolve(lerLS()); },
    gravar: function (item) {
      var itens = lerLS();
      var i = itens.findIndex(function (x) { return x.id === item.id; });
      if (i >= 0) itens[i] = item; else itens.push(item);
      gravarLS(itens);
      return Promise.resolve();
    },
    apagar: function (id) {
      gravarLS(lerLS().filter(function (x) { return x.id !== id; }));
      return Promise.resolve();
    },
    limpar: function () {
      gravarLS([]);
      return Promise.resolve();
    },
    lerCfg: function (chave) {
      try {
        var tudo = JSON.parse(global.localStorage.getItem(CHAVE_LS_CFG) || '{}');
        return Promise.resolve(chave in tudo ? tudo[chave] : null);
      } catch (e) {
        return Promise.resolve(null);
      }
    },
    gravarCfg: function (chave, valor) {
      var tudo = {};
      try {
        tudo = JSON.parse(global.localStorage.getItem(CHAVE_LS_CFG) || '{}');
      } catch (e) { /* começa do zero */ }
      if (valor === null) delete tudo[chave]; else tudo[chave] = valor;
      global.localStorage.setItem(CHAVE_LS_CFG, JSON.stringify(tudo));
      return Promise.resolve();
    }
  };

  /* ---------------- escolha do backend ---------------- */

  var escolhido = null;

  function backend() {
    if (escolhido) return Promise.resolve(escolhido);
    return idb.listar()
      .then(function () { escolhido = idb; return idb; })
      .catch(function () { escolhido = ls; return ls; });
  }

  // Na reserva a foto precisa virar texto (data URL); no IndexedDB o Blob vai direto.
  function prepararFoto(item, alvo) {
    if (alvo.nome !== 'localstorage' || !(item.foto instanceof Blob)) {
      return Promise.resolve(item);
    }
    return new Promise(function (resolve) {
      var leitor = new FileReader();
      leitor.onload = function () {
        resolve(Object.assign({}, item, { foto: leitor.result }));
      };
      leitor.onerror = function () { resolve(Object.assign({}, item, { foto: null })); };
      leitor.readAsDataURL(item.foto);
    });
  }

  global.Dados = {
    listar: function () {
      return backend().then(function (b) { return b.listar(); });
    },
    gravar: function (item) {
      return backend().then(function (b) {
        return prepararFoto(item, b).then(function (pronto) { return b.gravar(pronto); });
      });
    },
    apagar: function (id) {
      return backend().then(function (b) { return b.apagar(id); });
    },
    limpar: function () {
      return backend().then(function (b) { return b.limpar(); });
    },

    // Nota fiscal da compra: { foto, totalCent, quando }
    lerNota: function () {
      return backend().then(function (b) { return b.lerCfg('nota'); });
    },
    gravarNota: function (nota) {
      return backend().then(function (b) {
        if (nota === null) return b.gravarCfg('nota', null);
        return prepararFoto(nota, b).then(function (pronta) {
          return b.gravarCfg('nota', pronta);
        });
      });
    }
  };
})(window);
