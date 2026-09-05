/* Asantewaa — plataforma de agenda.
 *
 * Tudo fica no navegador (localStorage). É uma prévia: funciona de verdade,
 * some se ela limpar os dados do site, e não conversa com servidor nenhum.
 * A versão paga troca esta camada por um banco, sem mexer no resto.
 */
'use strict';

const CHAVE = 'asantewaa.v3';
const ZAP = '5511994109601';

/* ── serviços iniciais ──────────────────────────────────────────────────
 * Duração e valor de trança afro em São Paulo. É chute informado, e ela
 * corrige na aba Serviços — por isso tudo aqui é editável. O `retoque` é o
 * que faz a lista de "hora de voltar" existir: box braids pede manutenção
 * por volta de 60 dias, nagô bem antes disso.                            */
const SERVICOS_PADRAO = [
  { id: 's1', nome: 'Box Braids',            min: 300, preco: 280, retoque: 60 },
  { id: 's2', nome: 'Knotless Braids',       min: 360, preco: 350, retoque: 60 },
  { id: 's3', nome: 'Faux Locs',             min: 420, preco: 400, retoque: 75 },
  { id: 's4', nome: 'Nu Locs',               min: 360, preco: 380, retoque: 75 },
  { id: 's5', nome: 'Tranças Nagô',          min: 150, preco: 150, retoque: 30 },
  { id: 's6', nome: 'Passion Twist',         min: 300, preco: 320, retoque: 60 },
  { id: 's7', nome: 'Manutenção de Locs',    min: 180, preco: 180, retoque: 45 },
  { id: 's8', nome: 'Crochet Braids',        min: 180, preco: 200, retoque: 50 },
  { id: 's9', nome: 'Lavagem + Hidratação',  min:  90, preco:  90, retoque: 30 },
  { id: 's10', nome: 'Retoque de raiz',      min: 120, preco: 130, retoque: 45 },
];

const ABRE = 9, FECHA = 21;          // faixa mostrada na agenda

/* ── estado ─────────────────────────────────────────────────────────── */
let dados = carregar();
let diaAtivo = hojeISO();
let periodo = '30d';
let vista = 'dia';
let filtroCli = 'todos';
let buscaCli = '';

function carregar() {
  try {
    const cru = localStorage.getItem(CHAVE);
    if (cru) return JSON.parse(cru);
  } catch (e) { /* localStorage bloqueado: segue com dados de exemplo */ }
  return semear();
}

function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(dados)); }
  catch (e) { /* modo privado: a sessão funciona, só não persiste */ }
}

/* ── utilidades de data ─────────────────────────────────────────────── */
function hojeISO(d) { 
  const x = d ? new Date(d) : new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
function maisDias(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  const x = new Date(a, m - 1, d + n);
  return hojeISO(x);
}
function diasEntre(a, b) {
  const [a1, m1, d1] = a.split('-').map(Number), [a2, m2, d2] = b.split('-').map(Number);
  return Math.round((new Date(a2, m2 - 1, d2) - new Date(a1, m1 - 1, d1)) / 86400000);
}
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function nomeDia(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return DIAS[new Date(a, m - 1, d).getDay()];
}
function dataCurta(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1]}`;
}
function hhmm(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
function dur(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`) : `${m}min`;
}
function reais(v) {
  return 'R$ ' + Math.round(v).toLocaleString('pt-BR');
}
function esc(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function iniciais(nome) {
  return (nome || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}
function achatar(t) {
  return (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function id() { return Math.random().toString(36).slice(2, 10); }

/* ── acesso ─────────────────────────────────────────────────────────── */
const servico = sid => dados.servicos.find(s => s.id === sid) || { nome: '—', min: 60, preco: 0, retoque: 45 };
const cliente = cid => dados.clientes.find(c => c.id === cid) || { nome: '—', tel: '' };
const doDia = iso => dados.marcacoes.filter(m => m.data === iso).sort((a, b) => a.inicio - b.inicio);

function historicoDe(cid) {
  return dados.marcacoes.filter(m => m.cliente === cid && m.estado === 'feito')
    .sort((a, b) => b.data.localeCompare(a.data));
}
function ultimaVisita(cid) {
  const h = historicoDe(cid);
  return h.length ? h[0] : null;
}
function gastoTotal(cid) {
  return historicoDe(cid).reduce((s, m) => s + (m.valor ?? servico(m.servico).preco), 0);
}

/* Dias que faltam (negativo = passou da hora) para o retoque do último
 * procedimento. É esta conta que transforma a lista de clientes em lista de
 * trabalho: quem passou do ponto é quem está prestes a procurar outro salão. */
function diasAteRetoque(cid) {
  const u = ultimaVisita(cid);
  if (!u) return null;
  return servico(u.servico).retoque - diasEntre(u.data, hojeISO());
}

/* ── conflito de horário ────────────────────────────────────────────────
 * A regra que justifica o sistema inteiro: box braids ocupa cinco horas de
 * cadeira, e marcar alguém por cima significa atender mal as duas.          */
function conflito(data, inicio, minutos, ignorar) {
  const fim = inicio + minutos;
  return doDia(data).find(m => {
    if (m.id === ignorar || m.estado === 'faltou') return false;
    const mFim = m.inicio + servico(m.servico).min;
    return inicio < mFim && m.inicio < fim;
  });
}

/* ── semente de demonstração ────────────────────────────────────────── */
function semear() {
  const cl = [
    ['Aline Ferreira',   '11987654321', 'antigo'],
    ['Bruna Nascimento', '11976543210', 'antigo'],
    ['Carla Domingues',  '11965432109', 'novo'],
    ['Débora Silva',     '11954321098', 'antigo'],
    ['Eliane Souza',     '11943210987', 'antigo'],
    ['Fernanda Rocha',   '11932109876', 'novo'],
    ['Gabriela Lima',    '11921098765', 'antigo'],
    ['Helena Martins',   '11910987654', 'antigo'],
  ].map(([nome, tel, tipo]) => ({
    id: id(), nome, tel, tipo, origem: 'whatsapp', obs: '', criado: hojeISO()
  }));

  const marc = [];
  const põe = (ci, si, dias, inicio, estado) => marc.push({
    id: id(), cliente: cl[ci].id, servico: si, data: maisDias(hojeISO(), dias),
    inicio, estado, origem: 'whatsapp', obs: '', valor: null
  });
  // Passado escolhido para a tela nascer com trabalho a fazer: duas clientes
  // já passaram do retoque e uma vence esta semana. Uma agenda de exemplo sem
  // ninguém para chamar esconde justamente a função que traz dinheiro de volta.
  põe(0, 's1',  -66, 10 * 60, 'feito');   // box braids, retoque 60 → passou 6
  põe(1, 's3',  -79,  9 * 60, 'feito');   // faux locs, retoque 75 → passou 4
  põe(6, 's7',  -42, 15 * 60, 'feito');   // manut. locs, retoque 45 → faltam 3
  põe(4, 's2',  -58, 10 * 60, 'feito');   // knotless, retoque 60 → faltam 2
  põe(3, 's5',  -40, 14 * 60, 'feito');   // nagô, retoque 30 → passou 10
  põe(7, 's6',  -20, 10 * 60, 'feito');   // passion twist → ainda longe
  põe(7, 's9',   -3, 17 * 60, 'feito');   // Helena voltou faz pouco
  põe(5, 's1',   -1, 10 * 60, 'feito');   // Fernanda estreou ontem
  põe(2, 's5',   -1, 16 * 60, 'faltou');  // uma falta, para o número existir

  // Hoje e os próximos dias, para a agenda abrir com movimento.
  põe(2, 's1', 0, 10 * 60, 'marcado');
  põe(5, 's5', 0, 16 * 60, 'marcado');
  põe(6, 's4', 1,  9 * 60, 'marcado');
  põe(7, 's8', 2, 14 * 60, 'marcado');
  põe(0, 's7', 3, 11 * 60, 'marcado');

  return { servicos: SERVICOS_PADRAO.slice(), clientes: cl, marcacoes: marc };
}


/* ═══════════ modal ═══════════ */
const modal = document.getElementById('modal');
const painel = document.getElementById('modal-corpo');
function abrir(html) {
  painel.innerHTML = html;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}
function fechar() {
  modal.hidden = true; painel.innerHTML = ''; document.body.style.overflow = '';
}
modal.addEventListener('click', e => { if (e.target === modal) fechar(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) fechar(); });

/* ═══════════ entrada em cena ═══════════
 * IntersectionObserver, não listener de scroll: o segundo repinta a cada
 * pixel rolado e derruba o quadro no celular dela.                        */
const olho = new IntersectionObserver(ent => {
  ent.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); olho.unobserve(e.target); } });
}, { threshold: .08, rootMargin: '0px 0px -40px' });
const semMovimento = window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function animarEntrada() {
  const alvos = document.querySelectorAll('.entra:not(.vis)');
  // Quem pediu menos movimento no sistema não recebe animação nenhuma.
  if (semMovimento || !('IntersectionObserver' in window)) {
    alvos.forEach(el => el.classList.add('vis'));
    return;
  }
  alvos.forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i * 70, 340)}ms`;
    olho.observe(el);
  });
  // Rede de segurança: conteúdo que depende de animação para aparecer é
  // conteúdo que pode sumir. Se em 1,5s algo ainda estiver invisível — aba
  // trocada, observer que não disparou, aparelho lento — mostra assim mesmo.
  setTimeout(() => {
    document.querySelectorAll('.entra:not(.vis)').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 1.6) el.classList.add('vis');
    });
  }, 1500);
}

/* ═══════════ início ═══════════ */
function pintarInicio() {
  const hoje = doDia(hojeISO()).filter(m => m.estado !== 'faltou');
  const valor = hoje.reduce((s, m) => s + (m.valor ?? servico(m.servico).preco), 0);
  const min = hoje.reduce((s, m) => s + servico(m.servico).min, 0);

  const h = new Date().getHours();
  document.querySelector('.capa h1').innerHTML =
    `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'},<br><em>Asantewaa Hair</em>`;
  document.getElementById('capa-frase').textContent = hoje.length
    ? `Você tem ${hoje.length} cliente${hoje.length > 1 ? 's' : ''} hoje e ${dur(min)} de cadeira ocupada.`
    : 'Nenhuma cliente marcada para hoje. Bom momento para chamar quem está na hora do retoque.';

  document.getElementById('i-hoje').textContent = hoje.length;
  document.getElementById('i-hoje-n').textContent = hoje.length
    ? `primeira às ${hhmm(Math.min(...hoje.map(m => m.inicio)))}` : 'nenhuma cliente marcada';
  document.getElementById('i-valor').textContent = reais(valor);
  document.getElementById('i-horas').textContent = `${dur(min)} de cadeira`;

  const ini30 = maisDias(hojeISO(), -29);
  const f30 = dados.marcacoes.filter(m => m.estado === 'feito' && m.data >= ini30);
  document.getElementById('i-mes').textContent =
    reais(f30.reduce((s, m) => s + (m.valor ?? servico(m.servico).preco), 0));
  document.getElementById('i-mes-n').textContent = `${f30.length} procedimento(s)`;
  document.getElementById('a-cli').textContent = `${dados.clientes.length} na carteira`;

  // hora do retoque
  const retoque = dados.clientes
    .map(c => ({ c, falta: diasAteRetoque(c.id) }))
    .filter(x => x.falta !== null && x.falta <= 7)
    .sort((a, b) => a.falta - b.falta).slice(0, 4);
  document.getElementById('i-retoque').innerHTML = retoque.length
    ? retoque.map(({ c, falta }) => `<div class="linha-item" data-cli="${c.id}">
        <div class="avatar">${esc(iniciais(c.nome))}</div>
        <div class="meio"><b>${esc(c.nome)}</b>
          <span>${esc(servico(ultimaVisita(c.id).servico).nome)}</span></div>
        <div class="fim"><b style="color:${falta <= 0 ? 'var(--coral)' : 'var(--ambar)'}">
          ${falta <= 0 ? `${-falta}d atrás` : `em ${falta}d`}</b><span>retoque</span></div>
      </div>`).join('')
    : '<div class="nada"><b>Ninguém no ponto</b>Todas as clientes estão em dia.</div>';

  // próximos dias
  const futuros = dados.marcacoes
    .filter(m => m.data > hojeISO() && m.estado === 'marcado')
    .sort((a, b) => (a.data + a.inicio).localeCompare(b.data + b.inicio)).slice(0, 4);
  document.getElementById('i-proximos').innerHTML = futuros.length
    ? futuros.map(m => `<div class="linha-item" data-marc="${m.id}">
        <div class="avatar">${esc(iniciais(cliente(m.cliente).nome))}</div>
        <div class="meio"><b>${esc(cliente(m.cliente).nome)}</b>
          <span>${esc(servico(m.servico).nome)}</span></div>
        <div class="fim"><b>${dataCurta(m.data)}</b><span>${hhmm(m.inicio)}</span></div>
      </div>`).join('')
    : '<div class="nada"><b>Agenda livre</b>Nada marcado para os próximos dias.</div>';

  document.querySelectorAll('#i-retoque [data-cli]').forEach(el =>
    el.addEventListener('click', () => verCliente(el.dataset.cli)));
  document.querySelectorAll('#i-proximos [data-marc]').forEach(el =>
    el.addEventListener('click', () => verMarcacao(el.dataset.marc)));
}

/* ═══════════ agenda: dia, semana e mês ═══════════ */
function pintarAgenda() {
  const alvo = document.getElementById('vista');
  if (vista === 'dia') { tituloDia(); alvo.innerHTML = htmlDia(); ligarDia(); }
  else if (vista === 'semana') { tituloSemana(); alvo.innerHTML = htmlSemana(); ligarGrade(); }
  else { tituloMes(); alvo.innerHTML = htmlMes(); ligarGrade(); }
  resumoDoTopo();
}

function resumoDoTopo() {
  let lista;
  if (vista === 'dia') lista = doDia(diaAtivo);
  else {
    const [a, b] = faixaDaVista();
    lista = dados.marcacoes.filter(m => m.data >= a && m.data <= b);
  }
  const vivas = lista.filter(m => m.estado !== 'faltou');
  document.getElementById('ag-qtd').textContent = vivas.length;
  document.getElementById('ag-valor').textContent =
    reais(vivas.reduce((s, m) => s + (m.valor ?? servico(m.servico).preco), 0));
  document.getElementById('ag-horas').textContent =
    dur(vivas.reduce((s, m) => s + servico(m.servico).min, 0));
}

function faixaDaVista() {
  if (vista === 'dia') return [diaAtivo, diaAtivo];
  if (vista === 'semana') {
    const [a, m, d] = diaAtivo.split('-').map(Number);
    const dow = new Date(a, m - 1, d).getDay();
    return [maisDias(diaAtivo, -dow), maisDias(diaAtivo, 6 - dow)];
  }
  const [a, m] = diaAtivo.split('-').map(Number);
  const ult = new Date(a, m, 0).getDate();
  return [`${a}-${String(m).padStart(2, '0')}-01`,
          `${a}-${String(m).padStart(2, '0')}-${String(ult).padStart(2, '0')}`];
}

function tituloDia() {
  document.getElementById('per-tit').textContent = nomeDia(diaAtivo);
  document.getElementById('per-sub').textContent =
    dataCurta(diaAtivo) + (diaAtivo === hojeISO() ? ' · hoje' : '');
}
function tituloSemana() {
  const [a, b] = faixaDaVista();
  document.getElementById('per-tit').textContent = 'Semana';
  document.getElementById('per-sub').textContent = `${dataCurta(a)} a ${dataCurta(b)}`;
}
function tituloMes() {
  const [a, m] = diaAtivo.split('-').map(Number);
  const nomes = ['janeiro','fevereiro','março','abril','maio','junho','julho',
                 'agosto','setembro','outubro','novembro','dezembro'];
  document.getElementById('per-tit').textContent = nomes[m - 1];
  document.getElementById('per-sub').textContent = a;
}

function htmlDia() {
  const lista = doDia(diaAtivo);
  if (!lista.length) return `<div class="casca"><div class="nucleo nada">
    <b>Dia livre</b>Toque em Marcar para abrir um horário.</div></div>`;
  let h = '';
  for (let hora = ABRE; hora < FECHA; hora++) {
    const naHora = lista.filter(m => m.inicio >= hora * 60 && m.inicio < (hora + 1) * 60);
    h += `<div class="hora"><div class="rot">${String(hora).padStart(2, '0')}:00</div><div>`;
    if (naHora.length) h += naHora.map(cartao).join('');
    else {
      const cobre = lista.find(m => m.estado !== 'faltou' &&
        m.inicio < (hora + 1) * 60 && hora * 60 < m.inicio + servico(m.servico).min);
      h += cobre
        ? `<div class="segue">${esc(cliente(cobre.cliente).nome.split(' ')[0])} ·
             ${esc(servico(cobre.servico).nome)} em andamento</div>`
        : `<button class="livre" data-hora="${hora}">livre · toque para marcar</button>`;
    }
    h += '</div></div>';
  }
  return h;
}

function cartao(m) {
  const c = cliente(m.cliente), s = servico(m.servico);
  const et = [];
  if (m.estado === 'feito') et.push('<span class="etiq et-feito">atendida</span>');
  else if (m.estado === 'faltou') et.push('<span class="etiq et-faltou">faltou</span>');
  else et.push(c.tipo === 'novo' ? '<span class="etiq et-novo">cliente nova</span>'
                                 : '<span class="etiq et-velho">de casa</span>');
  if (m.origem === 'whatsapp') et.push('<span class="etiq et-zap">veio do zap</span>');
  const classe = m.estado === 'feito' ? 'feito' : m.estado === 'faltou' ? 'faltou'
               : c.tipo === 'novo' ? 'novo' : '';
  return `<div class="cartao-ag ${classe}" data-id="${m.id}">
    <h3>${esc(c.nome)} ${et.join('')}</h3>
    <div class="proc">${esc(s.nome)}</div>
    <div class="meta"><span>${hhmm(m.inicio)} — ${hhmm(m.inicio + s.min)} · ${dur(s.min)}</span>
      <span>${reais(m.valor ?? s.preco)}</span></div>
    ${m.obs ? `<div class="meta" style="margin-top:5px"><span>${esc(m.obs)}</span></div>` : ''}
  </div>`;
}

function htmlSemana() {
  const [ini] = faixaDaVista();
  let h = '<div class="semana">';
  for (let i = 0; i < 7; i++) {
    const d = maisDias(ini, i);
    const lista = doDia(d);
    const val = lista.filter(m => m.estado !== 'faltou')
      .reduce((s, m) => s + (m.valor ?? servico(m.servico).preco), 0);
    h += `<div class="col-dia ${d === hojeISO() ? 'hoje' : ''}" data-dia="${d}">
      <div class="cab">${nomeDia(d).slice(0, 3)}</div>
      <div class="num">${Number(d.split('-')[2])}</div>
      ${lista.slice(0, 4).map(m => `<div class="pilula ${m.estado === 'feito' ? 'feito' : ''}">
        ${hhmm(m.inicio)} ${esc(cliente(m.cliente).nome.split(' ')[0])}</div>`).join('')}
      ${lista.length > 4 ? `<div class="tot">+${lista.length - 4} outras</div>` : ''}
      ${val ? `<div class="tot">${reais(val)}</div>` : ''}
    </div>`;
  }
  return h + '</div>';
}

function htmlMes() {
  const [a, m] = diaAtivo.split('-').map(Number);
  const primeiro = new Date(a, m - 1, 1).getDay();
  const ult = new Date(a, m, 0).getDate();
  let h = '<div class="casca"><div class="nucleo" style="padding:14px"><div class="mes">';
  ['dom','seg','ter','qua','qui','sex','sáb'].forEach(d => h += `<div class="cab-dia">${d}</div>`);
  for (let i = 0; i < primeiro; i++) h += '<div class="dia-mes fora"></div>';
  for (let d = 1; d <= ult; d++) {
    const iso = `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const lista = doDia(iso);
    const val = lista.filter(x => x.estado !== 'faltou')
      .reduce((s, x) => s + (x.valor ?? servico(x.servico).preco), 0);
    h += `<div class="dia-mes ${iso === hojeISO() ? 'hoje' : ''}" data-dia="${iso}">
      <div class="n">${d}</div>
      <div class="pontos">${lista.slice(0, 6).map(x =>
        `<span class="pt ${x.estado === 'feito' ? 'feito' : ''}"></span>`).join('')}</div>
      ${val ? `<div class="val">${reais(val).replace('R$ ', '')}</div>` : ''}
    </div>`;
  }
  return h + '</div></div></div>';
}

function ligarDia() {
  document.querySelectorAll('#vista .livre').forEach(b =>
    b.addEventListener('click', () => formMarcacao(null, Number(b.dataset.hora) * 60)));
  document.querySelectorAll('#vista .cartao-ag').forEach(c =>
    c.addEventListener('click', () => verMarcacao(c.dataset.id)));
}
function ligarGrade() {
  document.querySelectorAll('#vista [data-dia]').forEach(el =>
    el.addEventListener('click', () => {
      diaAtivo = el.dataset.dia; vista = 'dia';
      document.querySelectorAll('.abas-mini button').forEach(b =>
        b.classList.toggle('on', b.dataset.v === 'dia'));
      pintarAgenda();
    }));
}

/* ═══════════ formulário de agendamento ═══════════ */
function formMarcacao(marcId, horaSugerida, clientePre) {
  const m = marcId ? dados.marcacoes.find(x => x.id === marcId) : null;
  const opServ = dados.servicos.map(s =>
    `<option value="${s.id}" ${m && m.servico === s.id ? 'selected' : ''}>
      ${esc(s.nome)} — ${dur(s.min)} — ${reais(s.preco)}</option>`).join('');
  const opCli = dados.clientes.slice().sort((a, b) => a.nome.localeCompare(b.nome))
    .map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  const ini = m ? m.inicio : (horaSugerida ?? 10 * 60);

  abrir(`
    <span class="selo">${m ? 'Editar' : 'Nova marcação'}</span>
    <h2 style="margin-top:12px">${m ? 'Trocar horário' : 'Marcar horário'}</h2>
    <div class="sub">${m ? 'Mude o que precisar e salve.' : 'Cliente nova ou de casa.'}</div>

    <label>Quem vai atender</label>
    <select id="f-quem"><option value="__nova">Cliente nova — cadastrar agora</option>${opCli}</select>
    <div id="bloco-nova">
      <div class="dupla">
        <div><label>Nome</label><input id="f-nome" placeholder="Nome completo"></div>
        <div><label>WhatsApp</label><input id="f-tel" inputmode="numeric" placeholder="11 90000-0000"></div>
      </div>
    </div>

    <label>Procedimento</label>
    <select id="f-serv">${opServ}</select>

    <div class="dupla">
      <div><label>Dia</label><input id="f-data" type="date" value="${m ? m.data : diaAtivo}"></div>
      <div><label>Começa às</label><input id="f-hora" type="time" value="${hhmm(ini)}"></div>
    </div>

    <label>Como ela chegou</label>
    <select id="f-origem">${['whatsapp:WhatsApp','indicacao:Indicação','instagram:Instagram',
      'passou:Passou na porta','outro:Outro'].map(o => { const [v, r] = o.split(':');
      return `<option value="${v}" ${m && m.origem === v ? 'selected' : ''}>${r}</option>`; }).join('')}</select>

    <label>Observação</label>
    <textarea id="f-obs" placeholder="Cor da fibra, alergia, preferência…">${m ? esc(m.obs) : ''}</textarea>

    <div id="f-erro" class="recado alerta" hidden></div>
    <div class="linha-bt" style="margin-top:22px">
      <button class="bt larga" id="f-salvar">${m ? 'Salvar' : 'Confirmar'}
        <span class="bolinha">✓</span></button>
      <button class="bt clara so-texto larga" id="f-cancelar">Cancelar</button>
    </div>
  `);

  const sel = document.getElementById('f-quem');
  const bloco = document.getElementById('bloco-nova');
  if (m) sel.value = m.cliente;
  else if (clientePre) sel.value = clientePre;
  const alterna = () => { bloco.hidden = sel.value !== '__nova'; };
  sel.addEventListener('change', alterna); alterna();
  document.getElementById('f-cancelar').addEventListener('click', fechar);
  document.getElementById('f-salvar').addEventListener('click', () => salvarMarcacao(marcId));
}

function erroForm(msg) {
  const c = document.getElementById('f-erro');
  c.textContent = msg; c.hidden = false;
  c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function salvarMarcacao(marcId) {
  const quem = document.getElementById('f-quem').value;
  const sid = document.getElementById('f-serv').value;
  const data = document.getElementById('f-data').value;
  const [hh, mm] = document.getElementById('f-hora').value.split(':').map(Number);
  const inicio = hh * 60 + mm;
  const origem = document.getElementById('f-origem').value;
  const obs = document.getElementById('f-obs').value.trim();
  if (!data || Number.isNaN(inicio)) return erroForm('Preencha o dia e a hora.');

  let cid = quem;
  if (quem === '__nova') {
    const nome = document.getElementById('f-nome').value.trim();
    const tel = document.getElementById('f-tel').value.replace(/\D/g, '');
    if (!nome) return erroForm('Escreva o nome da cliente.');
    const ja = dados.clientes.find(c => achatar(c.nome) === achatar(nome));
    if (ja) cid = ja.id;
    else {
      cid = id();
      dados.clientes.push({ id: cid, nome, tel, tipo: 'novo', origem, obs: '', criado: hojeISO() });
    }
  }

  const bate = conflito(data, inicio, servico(sid).min, marcId);
  if (bate) {
    const c = cliente(bate.cliente), s = servico(bate.servico);
    return erroForm(`Esse horário bate com ${c.nome} — ${s.nome}, das ${hhmm(bate.inicio)} ` +
      `às ${hhmm(bate.inicio + s.min)}. Escolha outro horário.`);
  }

  if (marcId) Object.assign(dados.marcacoes.find(x => x.id === marcId),
    { cliente: cid, servico: sid, data, inicio, origem, obs });
  else dados.marcacoes.push({ id: id(), cliente: cid, servico: sid, data, inicio,
    estado: 'marcado', origem, obs, valor: null });
  salvar(); diaAtivo = data; fechar(); pintarTudo();
}

/* ═══════════ detalhe do agendamento ═══════════ */
function verMarcacao(mid) {
  const m = dados.marcacoes.find(x => x.id === mid);
  if (!m) return;
  const c = cliente(m.cliente), s = servico(m.servico);
  const valor = m.valor ?? s.preco;
  abrir(`
    <span class="selo">${dataCurta(m.data)} · ${hhmm(m.inicio)}</span>
    <h2 style="margin-top:12px">${esc(c.nome)}</h2>
    <div class="sub">${esc(s.nome)} — das ${hhmm(m.inicio)} às ${hhmm(m.inicio + s.min)}</div>
    <div class="bento" style="margin-bottom:16px">
      <div class="cel g casca"><div class="nucleo metr">
        <span class="rot">Na cadeira</span><span class="val">${dur(s.min)}</span></div></div>
      <div class="cel g casca"><div class="nucleo metr">
        <span class="rot">Valor</span><span class="val marca">${reais(valor)}</span></div></div>
    </div>
    ${m.obs ? `<div class="recado">${esc(m.obs)}</div>` : ''}
    <label>Situação</label>
    <div>${['marcado:Marcado','feito:Atendida','faltou:Faltou'].map(o => { const [v, r] = o.split(':');
      return `<button class="pino ${m.estado === v ? 'on' : ''}" data-estado="${v}">${r}</button>`;
    }).join('')}</div>
    <label>Valor cobrado</label>
    <input id="d-valor" type="number" inputmode="decimal" value="${valor}">
    <div class="linha-bt" style="margin-top:22px">
      <a class="bt larga" style="text-decoration:none" target="_blank" rel="noopener"
         href="https://wa.me/55${esc(c.tel)}?text=${encodeURIComponent(
           `Oi ${c.nome.split(' ')[0]}! Confirmando seu horário na Asantewaa Hair: ` +
           `${s.nome}, ${dataCurta(m.data)} às ${hhmm(m.inicio)}. Até lá!`)}">
        Confirmar no WhatsApp <span class="bolinha">↗</span></a>
      <button class="bt clara so-texto larga" id="d-editar">Trocar horário</button>
      <button class="bt risco so-texto larga" id="d-excluir">Desmarcar</button>
    </div>
  `);
  painel.querySelectorAll('[data-estado]').forEach(b => b.addEventListener('click', () => {
    m.estado = b.dataset.estado;
    if (m.estado === 'feito') {
      const cl = dados.clientes.find(x => x.id === m.cliente);
      if (cl) cl.tipo = 'antigo';
    }
    m.valor = Number(document.getElementById('d-valor').value) || null;
    salvar(); fechar(); pintarTudo();
  }));
  document.getElementById('d-editar').addEventListener('click', () => formMarcacao(mid));
  document.getElementById('d-excluir').addEventListener('click', () => {
    dados.marcacoes = dados.marcacoes.filter(x => x.id !== mid);
    salvar(); fechar(); pintarTudo();
  });
}

/* ═══════════ clientes ═══════════ */
function pintarClientes() {
  const termos = achatar(buscaCli).split(/\s+/).filter(Boolean);
  let lista = dados.clientes.filter(c => {
    if (termos.length) {
      const alvo = achatar(c.nome + ' ' + c.tel);
      if (!termos.every(t => alvo.includes(t))) return false;
    }
    const falta = diasAteRetoque(c.id);
    if (filtroCli === 'retoque') return falta !== null && falta <= 7;
    if (filtroCli === 'sumidos') {
      const u = ultimaVisita(c.id);
      return u && diasEntre(u.data, hojeISO()) >= 60;
    }
    if (filtroCli === 'novos') return c.tipo === 'novo';
    return true;
  });
  lista.sort((a, b) => {
    const fa = diasAteRetoque(a.id), fb = diasAteRetoque(b.id);
    if (fa === null && fb === null) return a.nome.localeCompare(b.nome);
    if (fa === null) return 1;
    if (fb === null) return -1;
    return fa - fb;
  });

  const alvo = document.getElementById('lista-clientes');
  alvo.innerHTML = lista.length ? lista.map(c => {
    const u = ultimaVisita(c.id), falta = diasAteRetoque(c.id);
    let fim = '<span>ainda não veio</span>';
    if (u) {
      const cor = falta <= 0 ? 'var(--coral)' : falta <= 7 ? 'var(--ambar)' : 'var(--marca-fundo)';
      fim = `<b style="color:${cor}">${falta <= 0 ? `${-falta}d atrás` : `em ${falta}d`}</b>
             <span>veio há ${diasEntre(u.data, hojeISO())}d</span>`;
    }
    return `<div class="linha-item" data-cli="${c.id}">
      <div class="avatar">${esc(iniciais(c.nome))}</div>
      <div class="meio"><b>${esc(c.nome)}${c.tipo === 'novo'
        ? ' <span class="etiq et-novo">nova</span>' : ''}</b>
        <span>${u ? esc(servico(u.servico).nome) : 'sem histórico'} ·
          ${historicoDe(c.id).length} atendimento(s)</span></div>
      <div class="fim">${fim}</div></div>`;
  }).join('') : '<div class="nada"><b>Nenhuma cliente aqui</b>Mude o filtro ou a busca.</div>';

  alvo.querySelectorAll('[data-cli]').forEach(el =>
    el.addEventListener('click', () => verCliente(el.dataset.cli)));
}

function verCliente(cid) {
  const c = cliente(cid), hist = historicoDe(cid), u = hist[0];
  const falta = diasAteRetoque(cid), prim = c.nome.split(' ')[0];
  const msgs = [
    ['Chamar para o retoque', u
      ? `Oi ${prim}! Tudo bem? Faz ${diasEntre(u.data, hojeISO())} dias que você fez ` +
        `${servico(u.servico).nome} aqui na Asantewaa Hair. Já está na hora da manutenção — ` +
        `quer que eu separe um horário essa semana?`
      : `Oi ${prim}! Tudo bem? Aqui é da Asantewaa Hair. Quer marcar um horário?`],
    ['Oferecer novidade', `Oi ${prim}! Chegou fibra nova aqui na Asantewaa Hair e lembrei ` +
      `de você. Quer ver umas fotos do que dá pra fazer?`],
    ['Promoção da semana', `Oi ${prim}! Essa semana ficou um horário sobrando na ` +
      `${nomeDia(maisDias(hojeISO(), 3))} e resolvi oferecer com desconto pras clientes de ` +
      `casa. Te interessa?`],
  ];
  abrir(`
    <span class="selo">${c.tipo === 'novo' ? 'Cliente nova' : 'Cliente de casa'}</span>
    <h2 style="margin-top:12px">${esc(c.nome)}</h2>
    <div class="sub">${esc(c.tel || 'sem telefone')}</div>
    <div class="bento" style="margin-bottom:16px">
      <div class="cel casca"><div class="nucleo metr">
        <span class="rot">Atendimentos</span><span class="val">${hist.length}</span></div></div>
      <div class="cel casca"><div class="nucleo metr">
        <span class="rot">Já gastou</span><span class="val marca">${reais(gastoTotal(cid))}</span></div></div>
      <div class="cel casca"><div class="nucleo metr">
        <span class="rot">Retoque</span><span class="val" style="font-size:26px">${
          falta === null ? '—' : falta <= 0 ? `${-falta}d atrás` : `${falta}d`}</span></div></div>
    </div>
    ${falta !== null && falta <= 7 ? `<div class="recado ${falta <= 0 ? 'alerta' : ''}">
      ${falta <= 0 ? `Passou ${-falta} dia(s) do retoque de ${esc(servico(u.servico).nome)}.`
                   : `O retoque dela cai em ${falta} dia(s).`}
      É agora que ela decide se volta aqui ou procura outro salão.</div>` : ''}
    <label>Mandar mensagem</label>
    ${c.tel ? msgs.map(([rot, txt]) => `<a class="bt clara larga so-texto"
        style="margin-bottom:8px;text-decoration:none;justify-content:space-between"
        target="_blank" rel="noopener"
        href="https://wa.me/55${esc(c.tel)}?text=${encodeURIComponent(txt)}">${rot} <span>↗</span></a>`).join('')
      : '<div class="recado">Sem telefone cadastrado.</div>'}
    <label>Histórico</label>
    ${hist.length ? hist.map(m => `<div class="linha-item" style="cursor:default">
      <div class="meio"><b>${esc(servico(m.servico).nome)}</b>
        <span>${dataCurta(m.data)} · ${dur(servico(m.servico).min)}</span></div>
      <div class="fim"><b>${reais(m.valor ?? servico(m.servico).preco)}</b></div></div>`).join('')
      : '<div class="nada"><b>Ainda não foi atendida</b></div>'}
    <div class="linha-bt" style="margin-top:22px">
      <button class="bt larga" id="c-marcar">Marcar horário <span class="bolinha">+</span></button>
      <button class="bt clara so-texto larga" id="c-fechar">Fechar</button>
    </div>
  `);
  document.getElementById('c-fechar').addEventListener('click', fechar);
  document.getElementById('c-marcar').addEventListener('click', () => {
    fechar(); formMarcacao(null, 10 * 60, cid);
  });
}

/* ═══════════ contabilidade ═══════════ */
function faixaDoPeriodo() {
  const hoje = hojeISO();
  if (periodo === 'dia') return [hoje, hoje];
  if (periodo === 'semana') {
    const [a, m, d] = hoje.split('-').map(Number);
    const dow = new Date(a, m - 1, d).getDay();
    return [maisDias(hoje, -dow), maisDias(hoje, 6 - dow)];
  }
  if (periodo === '30d') return [maisDias(hoje, -29), hoje];
  const [a, m] = hoje.split('-').map(Number);
  const ult = new Date(a, m, 0).getDate();
  return [`${a}-${String(m).padStart(2, '0')}-01`,
          `${a}-${String(m).padStart(2, '0')}-${String(ult).padStart(2, '0')}`];
}

function pintarConta() {
  const [ini, fim] = faixaDoPeriodo();
  const noPer = dados.marcacoes.filter(m => m.data >= ini && m.data <= fim);
  const feitos = noPer.filter(m => m.estado === 'feito');
  const faltas = noPer.filter(m => m.estado === 'faltou');
  const fat = feitos.reduce((s, m) => s + (m.valor ?? servico(m.servico).preco), 0);
  const min = feitos.reduce((s, m) => s + servico(m.servico).min, 0);
  const perdido = faltas.reduce((s, m) => s + (m.valor ?? servico(m.servico).preco), 0);
  const novas = [...new Set(feitos.map(m => m.cliente))].filter(cid => {
    const h = historicoDe(cid);
    return h.length && h[h.length - 1].data >= ini;
  }).length;

  document.getElementById('c-fat').textContent = reais(fat);
  document.getElementById('c-fat-n').textContent = `${feitos.length} procedimento(s) concluído(s)`;
  document.getElementById('c-ticket').textContent = reais(feitos.length ? fat / feitos.length : 0);
  // O número que ela nunca tem: quanto rende cada hora de cadeira. É o que
  // diz se vale a pena manter um procedimento longo e barato na tabela.
  document.getElementById('c-hora').textContent = reais(min ? fat / (min / 60) : 0);
  document.getElementById('c-horas').textContent = `${dur(min)} trabalhadas`;
  document.getElementById('c-novas').textContent = novas;
  document.getElementById('c-faltas').textContent = faltas.length;
  document.getElementById('c-perdido').textContent = `${reais(perdido)} que deixaram de entrar`;

  const porServ = {};
  feitos.forEach(m => {
    const s = servico(m.servico);
    porServ[s.nome] = porServ[s.nome] || { n: 0, v: 0, min: 0 };
    porServ[s.nome].n++; porServ[s.nome].v += m.valor ?? s.preco; porServ[s.nome].min += s.min;
  });
  const ord = Object.entries(porServ).sort((a, b) => b[1].v - a[1].v);
  const topo = ord.length ? ord[0][1].v : 1;
  document.getElementById('c-ranking').innerHTML = ord.length ? ord.map(([nome, d]) =>
    `<div style="padding:11px 0">
      <div style="display:flex;justify-content:space-between;gap:12px;font-size:14px">
        <b>${esc(nome)}</b><span style="color:var(--tinta-2)">${d.n}× · ${reais(d.v)} ·
          ${reais(d.v / (d.min / 60))}/h</span></div>
      <div class="barra"><i style="width:${(d.v / topo * 100).toFixed(0)}%"></i></div></div>`).join('')
    : '<div class="nada"><b>Nada concluído no período</b></div>';

  const porOri = {};
  noPer.forEach(m => { porOri[m.origem || 'outro'] = (porOri[m.origem || 'outro'] || 0) + 1; });
  const rot = { whatsapp: 'WhatsApp', indicacao: 'Indicação', instagram: 'Instagram',
                passou: 'Passou na porta', outro: 'Outro' };
  const tot = Object.values(porOri).reduce((a, b) => a + b, 0) || 1;
  document.getElementById('c-origens').innerHTML = Object.keys(porOri).length
    ? Object.entries(porOri).sort((a, b) => b[1] - a[1]).map(([k, n]) =>
      `<div style="padding:11px 0">
        <div style="display:flex;justify-content:space-between;font-size:14px">
          <b>${rot[k] || k}</b><span style="color:var(--tinta-2)">${n} · ${(n / tot * 100).toFixed(0)}%</span></div>
        <div class="barra"><i style="width:${(n / tot * 100).toFixed(0)}%"></i></div></div>`).join('')
    : '<div class="nada"><b>Sem dados no período</b></div>';
}

/* ═══════════ serviços ═══════════ */
function pintarServicos() {
  const alvo = document.getElementById('lista-servicos');
  alvo.innerHTML = dados.servicos.map(s => `<div class="linha-item" data-serv="${s.id}">
    <div class="meio"><b>${esc(s.nome)}</b>
      <span>${dur(s.min)} na cadeira · volta em ${s.retoque} dias ·
        ${reais(s.preco / (s.min / 60))}/hora</span></div>
    <div class="fim"><b>${reais(s.preco)}</b><span>editar</span></div></div>`).join('');
  alvo.querySelectorAll('[data-serv]').forEach(el =>
    el.addEventListener('click', () => formServico(el.dataset.serv)));
}

function formServico(sid) {
  const s = sid ? dados.servicos.find(x => x.id === sid) : null;
  abrir(`
    <span class="selo">${s ? 'Editar' : 'Novo'}</span>
    <h2 style="margin-top:12px">${s ? esc(s.nome) : 'Novo serviço'}</h2>
    <div class="sub">O tempo é o que impede duas clientes no mesmo horário.</div>
    <label>Nome</label><input id="s-nome" value="${s ? esc(s.nome) : ''}" placeholder="Box Braids">
    <div class="dupla">
      <div><label>Duração (min)</label><input id="s-min" type="number" inputmode="numeric"
        value="${s ? s.min : 180}"></div>
      <div><label>Preço (R$)</label><input id="s-preco" type="number" inputmode="decimal"
        value="${s ? s.preco : 200}"></div>
    </div>
    <label>Volta para retoque em quantos dias</label>
    <input id="s-retoque" type="number" inputmode="numeric" value="${s ? s.retoque : 45}">
    <div id="f-erro" class="recado alerta" hidden></div>
    <div class="linha-bt" style="margin-top:22px">
      <button class="bt larga" id="s-salvar">Salvar <span class="bolinha">✓</span></button>
      <button class="bt clara so-texto larga" id="s-cancelar">Cancelar</button>
      ${s ? '<button class="bt risco so-texto larga" id="s-apagar">Apagar</button>' : ''}
    </div>
  `);
  document.getElementById('s-cancelar').addEventListener('click', fechar);
  document.getElementById('s-salvar').addEventListener('click', () => {
    const nome = document.getElementById('s-nome').value.trim();
    const min = Number(document.getElementById('s-min').value);
    const preco = Number(document.getElementById('s-preco').value);
    const retoque = Number(document.getElementById('s-retoque').value);
    if (!nome) return erroForm('Dê um nome ao serviço.');
    if (!(min > 0)) return erroForm('A duração precisa ser maior que zero.');
    if (s) Object.assign(s, { nome, min, preco, retoque });
    else dados.servicos.push({ id: id(), nome, min, preco, retoque });
    salvar(); fechar(); pintarTudo();
  });
  const ap = document.getElementById('s-apagar');
  if (ap) ap.addEventListener('click', () => {
    if (dados.marcacoes.some(m => m.servico === sid))
      return erroForm('Esse serviço já foi usado. Edite em vez de apagar.');
    dados.servicos = dados.servicos.filter(x => x.id !== sid);
    salvar(); fechar(); pintarTudo();
  });
}

/* ═══════════ navegação e arranque ═══════════ */
function irPara(tela) {
  ['inicio', 'agenda', 'clientes', 'conta', 'servicos'].forEach(t =>
    document.getElementById('tela-' + t).hidden = t !== tela);
  document.querySelectorAll('nav button').forEach(b =>
    b.classList.toggle('on', b.dataset.tela === tela));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  animarEntrada();
}

function pintarTudo() {
  pintarInicio(); pintarAgenda(); pintarClientes(); pintarConta(); pintarServicos();
  animarEntrada();
}

document.querySelectorAll('nav button').forEach(b =>
  b.addEventListener('click', () => irPara(b.dataset.tela)));
document.querySelectorAll('[data-ir]').forEach(b =>
  b.addEventListener('click', e => { e.preventDefault(); irPara(b.dataset.ir); }));

const passo = n => vista === 'dia' ? n : vista === 'semana' ? n * 7 : null;
document.getElementById('ant').addEventListener('click', () => {
  if (vista === 'mes') { const [a, m] = diaAtivo.split('-').map(Number);
    diaAtivo = hojeISO(new Date(a, m - 2, 1)); }
  else diaAtivo = maisDias(diaAtivo, passo(-1));
  pintarAgenda();
});
document.getElementById('prox').addEventListener('click', () => {
  if (vista === 'mes') { const [a, m] = diaAtivo.split('-').map(Number);
    diaAtivo = hojeISO(new Date(a, m, 1)); }
  else diaAtivo = maisDias(diaAtivo, passo(1));
  pintarAgenda();
});
document.getElementById('ir-hoje').addEventListener('click', () => {
  diaAtivo = hojeISO(); pintarAgenda();
});
document.querySelectorAll('.abas-mini button').forEach(b =>
  b.addEventListener('click', () => {
    vista = b.dataset.v;
    document.querySelectorAll('.abas-mini button').forEach(o => o.classList.toggle('on', o === b));
    pintarAgenda();
  }));
document.getElementById('novo-ag').addEventListener('click', () => formMarcacao(null, 10 * 60));
document.getElementById('ini-marcar').addEventListener('click', () => formMarcacao(null, 10 * 60));
document.getElementById('novo-serv').addEventListener('click', () => formServico(null));
document.getElementById('busca-cli').addEventListener('input', e => {
  buscaCli = e.target.value; pintarClientes();
});
document.querySelectorAll('#filtros-cli .pino').forEach(b =>
  b.addEventListener('click', () => {
    filtroCli = b.dataset.f;
    document.querySelectorAll('#filtros-cli .pino').forEach(o => o.classList.toggle('on', o === b));
    pintarClientes();
  }));
document.querySelectorAll('#filtros-per .pino').forEach(b =>
  b.addEventListener('click', () => {
    periodo = b.dataset.p;
    document.querySelectorAll('#filtros-per .pino').forEach(o => o.classList.toggle('on', o === b));
    pintarConta();
  }));

pintarTudo();
