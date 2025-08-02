import mondaySdk from "monday-sdk-js";
import dayjs from "dayjs";
import express from "express";

const monday = mondaySdk();
const app = express();
app.use(express.json());

// action endpoint (monday chama aqui)
app.post("/sla-deadline", async (req, res) => {
  try {
    const {
      payload: {
        inputFields: {
          itemId, boardId, clienteItemId, criticidade, // mapeados no recipe
          slaCriticoColId, slaAltaColId, slaMediaColId, slaBaixaColId,
          deadlineColId
        }
      }
    } = req.body;

    // 1. Ler SLAs do item do cliente
    const query = `query ($id: [Int]) {
      items (ids: $id) {
        column_values(ids: [
          "${slaCriticoColId}", "${slaAltaColId}",
          "${slaMediaColId}", "${slaBaixaColId}", "rank"
        ]) { id text value }
      }
    }`;
    const { data } = await monday.api(query, { id: clienteItemId });

    // 2. Converter texto → número
    const toNumber = id => Number(data.items[0].column_values
                                   .find(c => c.id === id).text || 0);
    const slaDias = {
      "Crítica": toNumber(slaCriticoColId),
      "Alta":    toNumber(slaAltaColId),
      "Média":   toNumber(slaMediaColId),
      "Baixa":   toNumber(slaBaixaColId)
    }[criticidade];

    // 3. Calcular deadline
    const deadlineDate = dayjs().add(slaDias, "day").format("YYYY-MM-DD");

    // 4. Escrever Deadline (e Rank se quiser copiar)
    await monday.api(`mutation ($item:Int!, $board:Int!, $vals:JSON!) {
      change_multiple_column_values(item_id:$item, board_id:$board, column_values:$vals) { id }
    }`, {
      item: itemId,
      board: boardId,
      vals: JSON.stringify({
        [deadlineColId]: { date: deadlineDate }
        // se desejar copiar Rank: "rank_copiado": { text: rankText }
      })
    });

    res.send({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: err.message });
  }
});
export default app;
