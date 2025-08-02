// api/webhook.js
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios'); // Para fazer requisições à API do monday

const app = express();
app.use(bodyParser.json());

// Seus Monday API Token e URL do segundo quadro
// Eles virão das variáveis de ambiente configuradas no Vercel
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;
const TARGET_BOARD_ID = process.env.TARGET_BOARD_ID; // ID do quadro onde as informações serão sincronizadas

// Middleware para verificar se as variáveis de ambiente estão configuradas
app.use((req, res, next) => {
    if (!MONDAY_API_TOKEN || !TARGET_BOARD_ID) {
        console.error("Erro: Variáveis de ambiente MONDAY_API_TOKEN ou TARGET_BOARD_ID não configuradas.");
        return res.status(500).send("Server configuration error.");
    }
    next();
});

app.post('/webhook', async (req, res) => {
    const { event } = req.body;

    // Validação básica para evitar requisições indesejadas
    if (!event || !event.boardId || !event.pulseId || !event.columnId || !event.value) {
        return res.status(200).send('No relevant event data.');
    }

    const sourceBoardId = event.boardId;
    const itemId = event.pulseId; // ID do item que foi alterado no quadro de clientes
    const changedColumnId = event.columnId;
    const newValue = event.value; // Novo valor da coluna

    // Verifique se a coluna alterada é uma das que você quer monitorar
    // Lembre-se de substituir 'id_da_coluna_rank', 'id_da_coluna_sla', 'id_da_coluna_receita' pelos IDs REAIS das suas colunas no Monday.
    const relevantColumns = ['id_da_coluna_rank', 'id_da_coluna_sla', 'id_da_coluna_receita'];

    if (relevantColumns.includes(changedColumnId)) {
        try {
            // 1. Obter todos os dados relevantes do item no quadro de clientes
            const query = `query {
                items (ids: [${itemId}]) {
                    name
                    column_values {
                        id
                        text
                        value
                    }
                }
            }`;

            const response = await axios.post('https://api.monday.com/v2', { query }, {
                headers: {
                    'Authorization': MONDAY_API_TOKEN,
                    'API-Version': '2023-10',
                    'Content-Type': 'application/json'
                }
            });

            const itemData = response.data.data.items[0];
            const itemName = itemData.name;
            let rank = '';
            let sla = '';
            let revenue = '';

            itemData.column_values.forEach(col => {
                // Lembre-se de substituir 'id_da_coluna_rank', 'id_da_coluna_sla', 'id_da_coluna_receita' pelos IDs REAIS das suas colunas no Monday.
                if (col.id === 'id_da_coluna_rank') {
                    rank = col.text || '';
                } else if (col.id === 'id_da_coluna_sla') {
                    sla = col.text || ''; // Ou formatar para data se for o caso
                } else if (col.id === 'id_da_coluna_receita') {
                    revenue = col.text || ''; // Ou col.value para valores numéricos
                }
            });

            // 2. Atualizar ou criar o item no quadro de destino
            const searchTargetBoardQuery = `query {
                boards (ids: [${TARGET_BOARD_ID}]) {
                    items_page (query_params: { rule: { column_id: "name", compare_value: "${itemName}" } }) {
                        items {
                            id
                        }
                    }
                }
            }`;

            const searchResponse = await axios.post('https://api.monday.com/v2', { query: searchTargetBoardQuery }, {
                headers: {
                    'Authorization': MONDAY_API_TOKEN,
                    'API-Version': '2023-10',
                    'Content-Type': 'application/json'
                }
            });

            const targetItems = searchResponse.data.data.boards[0].items_page.items;
            let targetItemId = null;

            if (targetItems && targetItems.length > 0) {
                targetItemId = targetItems[0].id;
            }

            // Lembre-se de substituir 'id_da_coluna_rank_no_destino', etc., pelos IDs REAIS das colunas no seu QUADRO DE DESTINO.
            const columnValuesToUpdate = JSON.stringify({
                'id_da_coluna_rank_no_destino': rank,
                'id_da_coluna_sla_no_destino': sla,
                'id_da_coluna_receita_no_destino': revenue
            });

            let mutation;
            if (targetItemId) {
                // Atualizar item existente
                mutation = `mutation {
                    change_multiple_column_values (item_id: ${targetItemId}, board_id: ${TARGET_BOARD_ID}, column_values: ${JSON.stringify(columnValuesToUpdate)}) {
                        id
                    }
                }`;
            } else {
                // Criar novo item
                mutation = `mutation {
                    create_item (board_id: ${TARGET_BOARD_ID}, item_name: "${itemName}", column_values: ${JSON.stringify(columnValuesToUpdate)}) {
                        id
                    }
                }`;
            }

            await axios.post('https://api.monday.com/v2', { query: mutation }, {
                headers: {
                    'Authorization': MONDAY_API_TOKEN,
                    'API-Version': '2023-10',
                    'Content-Type': 'application/json'
                }
            });

            console.log(`Item ${itemName} (ID: ${itemId}) sincronizado com sucesso.`);
            res.status(200).send('Webhook received and processed.');

        } catch (error) {
            console.error('Erro ao processar webhook:', error.response ? error.response.data : error.message);
            res.status(500).send('Error processing webhook.');
        }
    } else {
        res.status(200).send('Column not relevant.');
    }
});

// Exporte a instância do Express para que o Vercel possa usá-la como uma Serverless Function
module.exports = app;