# Roteiro de fumaça — refatoração do frontend

Executar manualmente no browser ao fim de cada fase da refatoração
(ver `docs/superpowers/specs/` ou o plano da sessão). Suba o servidor numa
porta separada da produção (`PORT=3099 node server.js`) — nunca reiniciar o
processo pm2 sem autorização.

## Login e navegação
- [ ] Login de usuário comum com código de 6 dígitos
- [ ] Login de admin (código + senha separada)
- [ ] Trocar de aba (Loja / Controle / Produtos / Usuários) sem recarregar a página
- [ ] Logout limpa a tela e volta para o login

## Busca (atenção ao foco do input)
- [ ] Buscar na Loja — **cursor e foco não saltam durante a digitação**
- [ ] Buscar em Controle — idem
- [ ] Buscar em Produtos — idem
- [ ] Buscar em Usuários — idem

## Loja
- [ ] Comprar um produto (define quantidade, confirma)
- [ ] Favoritar e desfavoritar um produto (ícone atualiza sem travar)
- [ ] Paginar o histórico de compras

## Admin — Controle
- [ ] Abrir detalhe de um usuário
- [ ] Ocultar um item de consumo
- [ ] Restaurar um item ocultado
- [ ] Zerar saldo de um usuário
- [ ] Zerar saldo de todos os usuários
- [ ] Auto-refresh do relatório continua funcionando após 60s
- [ ] Auto-refresh PAUSA enquanto um modal está aberto

## Admin — Produtos / Usuários
- [ ] Criar, editar, inativar/ativar e excluir um produto
- [ ] Criar, editar, inativar/ativar e excluir um usuário
- [ ] Alterar o próprio código de acesso
- [ ] Alterar a senha de administrador

## Geral
- [ ] Console do browser sem erros de CSP nem exceções JS
- [ ] Ícones do sprite aparecem corretamente em markup gerado por JS
  (lápis, lixeira, restaurar, alerta)
- [ ] Modais empilham corretamente (abrir um modal sobre outro)
