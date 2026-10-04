# BuscaPY — versão hospedada

Buscador responsivo com seis fontes, fotos e galerias nos cards, comparação de ofertas por loja e cotação do dólar do Compras Paraguai. O handler segue a interface Fetch do Cloudflare Worker e também pode ser executado no Node.js pelo adaptador HTTP do Render. Não usa banco de dados.

## Implantar no Render

Crie um Web Service a partir deste repositório, usando a branch `main` e:

- Runtime: Node
- Build command: `npm ci --include=dev && npm run build && npm test`
- Start command: `npm start`
- Health check path: `/api/health`

O servidor escuta em `0.0.0.0` na porta informada pelo Render em `PORT`. Não requer banco de dados nem variáveis secretas. O Worker continua sendo o handler da API; `server.mjs` adapta requisições HTTP do Node para a interface Fetch do Worker.

## Desenvolvimento

Requer Node 22 ou superior.

```sh
npm ci
npm run bundle
npm test
npm run build
npm run validate
```

Edite os arquivos em `src/`. `npm run bundle` incorpora o CSS, o JavaScript e o registro de fontes ao HTML e gera `worker/index.js`. O bundle é versionado para a publicação não depender de instalação de pacotes. A geração valida a sintaxe do script inserido na página.

## Fontes e procedência

| Fonte exibida | Origem dos dados | Estoque |
| --- | --- | --- |
| LG Importados | Catálogo JSON público `/produtos` | Somente itens com estoque informado pela LG |
| Compras Paraguai | Busca `/busca/` e página de comparação de ofertas | Não inferido |
| VisãoVip | Busca do Compras Paraguai com `loja=visaovip` | A confirmar |
| Shopping China | Busca do Compras Paraguai com `loja=shopping-china` | A confirmar |
| Cellshop | Busca do Compras Paraguai com `loja=cellshop` | A confirmar |
| Casa Maringá | API pública `/wp-json/wc/store/v1/products` | Usa `is_in_stock`, incluindo o estado sem estoque |

VisãoVip e Cellshop bloquearam o acesso automatizado direto durante a investigação. Shopping China `.com.br` retornou erro de certificado. As três integrações usam ofertas oficiais específicas da loja no Compras Paraguai, identificadas dessa forma na interface. Não representam uma conexão direta nem garantem cobertura do catálogo completo de cada loja. O parser verifica o nome da loja e o domínio do link para não atribuir o preço de outra loja ao card.

A Casa Maringá informa preços em unidades menores. O adaptador respeita `currency_minor_unit` e só preenche `priceUsd` quando a moeda original é USD. Valores de outras moedas aparecem sob consulta, sem conversão implícita.

## API e paginação

- `GET /api/search?q=...&source=...&page=1`: uma página da fonte indicada, itens, estado da fonte e metadados de paginação. `source` deve ser uma chave de `src/sources.mjs`. As páginas da API do BuscaPY começam em 1; o adaptador da LG traduz para a paginação original que começa em 0.
- `GET /api/search?q=...`: primeira página das seis fontes, incluindo a paginação de cada uma. Consumidores devem seguir `pagination[source].nextPage` para obter os resultados restantes.
- `GET /api/product?path=...`: galeria e ofertas da página indicada no Compras Paraguai. Aceita somente caminhos de produto, nunca URLs externas.
- `GET /api/exchange`: BRL, PYG e ARS para USD 1, data de atualização original, fonte e horário da consulta.

O cliente percorre todas as próximas páginas informadas pelas fontes, com até três consultas de busca simultâneas. Não existem mais os tetos silenciosos de 30 páginas do Compras Paraguai e 50 da LG. A validação de entrada admite páginas de 1 a 10.000; se uma origem exceder esse intervalo, a busca será indicada como incompleta. Resultados aparecem progressivamente, com deduplicação por identificador da fonte. Filtros e ordenação se aplicam aos dados já recebidos; a indicação de conclusão só aparece ao terminar a paginação.

Uma falha preserva os resultados anteriores e permite repetir apenas as páginas pendentes. Uma nova consulta cancela a anterior, e respostas atrasadas não substituem os novos resultados. Fontes podem atualizar o catálogo entre páginas; não há garantia de snapshot atômico.

## Galerias e câmbio

- Fotos são as fornecidas pelas fontes. A Casa Maringá e a LG já fornecem galerias na busca. Cards de ofertas do Compras Paraguai, incluindo as três lojas intermediadas, carregam a galeria ao se aproximarem da área visível ou ao abrir os detalhes.
- Duas consultas simultâneas de detalhe; galeria e painel compartilham a resposta. Setas só aparecem quando há mais de uma foto. As ofertas do comparador são extraídas exclusivamente de `#container-ofertas`, sem produtos relacionados.
- A cotação é lida de `.valor-cambio` na página inicial do Compras Paraguai. Os números da captura enviada pelo usuário não são usados como fallback. O horário é preservado como texto da origem, sem atribuir um fuso não informado.
- Atualização de cotação ao abrir a página, manualmente e a cada dez minutos enquanto a página estiver visível. Se uma atualização falhar após uma leitura válida, o valor anterior permanece com aviso explícito. Se não houver leitura válida, a cotação aparece indisponível.
- A cotação é de referência e não altera os preços em USD; cada loja pode aplicar seu próprio câmbio.
- Cache em memória de cinco minutos, limitado a 120 entradas, e timeout de 20 segundos por consulta à origem. O cache não é persistente nem compartilhado entre isolates. O cliente também limita o tempo das requisições.

## Verificação

32 testes automatizados de parsers, adaptadores, rotas do Worker e comportamento de interface em DOM simulado. Cobrem procedência, moeda, estoque, paginação acima dos limites anteriores, cancelamento, falhas parciais, repetição de páginas, filtros, galerias, câmbio indisponível e câmbio desatualizado. As fixtures são trechos de respostas públicas e não alimentam a busca real.

Consultas reais em 13/09/2026: as seis fontes responderam à busca `Xiaomi H50`; a cotação foi lida da página inicial. A paginação foi conferida nas páginas 2 e 5 (final) da Casa Maringá e 2 e 21 (final) da VisãoVip para `xiaomi`. Uma página de oferta da VisãoVip também retornou sua galeria. Esses testes não garantem disponibilidade futura dos sites nem equivalem a testes visuais em todos os navegadores.

A versão em ZIP anterior é um projeto React/Express separado e não recebe automaticamente alterações desta versão hospedada.
