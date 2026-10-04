# Ampliação de fontes e câmbio

Objetivo: incluir Casa Maringá, VisãoVip, Shopping China e Cellshop na mesma busca, mantendo galerias, comparação de lojas e filtros. Exibir a cotação publicada na página inicial do Compras Paraguai, com a data original.

## Decisões verificadas

- Casa Maringá: API pública WooCommerce Store (`/wp-json/wc/store/v1/products`), preços USD em unidades menores, estoque explícito, imagens completas e paginação nos cabeçalhos `X-WP-TotalPages`/`X-WP-Total`.
- VisãoVip e Cellshop bloquearam acesso automatizado direto. Shopping China `.com.br` retornou erro de certificado. Não contornar esses bloqueios. As três lojas têm buscas oficiais específicas no Compras Paraguai, com preço da loja e link direto em cada oferta. Identificar a procedência em cada card.
- Cotação: ler `.valor-cambio` na página inicial do Compras Paraguai. Não fixar os números da captura enviada. Não usar a cotação de outra loja. Manter o horário como texto da origem, sem inventar fuso.
- Remover tetos silenciosos de páginas. A API oferece uma página por fonte e informa a próxima. O cliente percorre as páginas com concorrência limitada, preservando resultados já obtidos, cancelamento ao iniciar outra busca e repetição de páginas que falharam.
- Estoque do comparador permanece não informado. Valores de outra moeda nunca são rotulados como USD.

## Execução e verificações

1. Fixtures reduzidas de respostas públicas; testes de moeda, procedência, filtro de loja, paginação além dos limites antigos e falhas parciais.
2. Adaptadores independentes, endpoint de cotação e cache de cinco minutos.
3. Filtros para seis fontes, cards e detalhes com procedência, faixa de câmbio e progresso da busca.
4. Testes de interface: todas as páginas, cancelamento, filtros, falha parcial, galerias e câmbio indisponível.
5. Consultas reais às seis fontes e à cotação; bundle, testes e validação do artefato. Publicar no Site existente mantendo a audiência atual.
