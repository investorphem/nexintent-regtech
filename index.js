import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors()); // Allows your future frontend dashboard to securely connect
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Initialize the OpenAI instance
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// In-memory session tracking for compliance officer queries
const sessions = new Map();

// ==========================================
// REGTECH COMPLIANCE ENGINE IMPLEMENTATION
// ==========================================
const tools = [
  {
    type: "function",
    function: {
      name: "queryComplianceSilo",
      description: "Queries the read-only transaction database silo for a specific flag type.",
      parameters: {
        type: "object",
        properties: {
          flag_type: { type: "string", description: "The compliance anomaly: 'high_risk', 'sanctions', or 'velocity'" },
          limit: { type: "integer", description: "Maximum number of data logs to pull" }
        },
        required: ["flag_type"]
      }
    }
  }
];

// Read-Only Mock Database Layer
async function queryComplianceSilo(args) {
  console.log(`[Secure DB Log] Scanning logs for flag: ${args.flag_type}`);
  return JSON.stringify([
    { tx_id: "TX-FIAT-902", amount: 14200, currency: "GBP", system_flag: "Sanctions Country Match", risk_score: 89 },
    { tx_id: "TX-STX-441", amount: 35000, currency: "cUSD", system_flag: "High-Velocity Wallet Spurt", risk_score: 92 }
  ]);
}

// ==========================================
// SECURE REST API ENDPOINT FOR WEB DASHBOARD
// ==========================================
app.post('/api/audit/query', async (req, res) => {
  const { userText, officerId } = req.body;
  const authHeader = req.headers.authorization;

  // 1. Strict Authorization Guardrail
  if (!authHeader || authHeader !== `Bearer ${process.env.DASHBOARD_SECRET_KEY}`) {
    return res.status(401).json({ error: "Unauthorized access: Invalid dashboard credential tokens." });
  }

  // 2. State Session Provisioning
  if (!sessions.has(officerId)) {
    sessions.set(officerId, [
      { 
        role: "system", 
        content: "You are NexIntent, an elite UK FinTech & Stablecoin Regulation AI Copilot. Analyze the internal data provided by your tools. Format compliance records into clean executive tables. Never manufacture mock data values." 
      }
    ]);
  }

  const conversation = sessions.get(officerId);
  conversation.push({ role: "user", content: userText });

  try {
    // 3. Request Evaluation via AI Intent Handler
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: conversation,
      tools: tools,
      tool_choice: "auto",
    });

    const responseMessage = response.choices[0].message;
    conversation.push(responseMessage);

    let finalResponseContent = "";

    // 4. Tool Execution Verification Layer
    if (responseMessage.tool_calls) {
      for (const toolCall of responseMessage.tool_calls) {
        const functionArgs = JSON.parse(toolCall.function.arguments);
        const dataPayload = await queryComplianceSilo(functionArgs);

        conversation.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: dataPayload,
        });
      }

      // Generate the polished audit overview output
      const analysisEngine = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: conversation,
      });

      finalResponseContent = analysisEngine.choices[0].message.content;
    } else {
      finalResponseContent = responseMessage.content;
    }

    conversation.push({ role: "assistant", content: finalResponseContent });

    // 5. Send secure data array back to frontend web components
    res.status(200).json({ 
      success: true, 
      data: finalResponseContent 
    });

  } catch (error) {
    console.error("System Exception Triggered:", error);
    res.status(500).json({ error: "An infrastructure error occurred processing the compliance log request." });
  }
});

app.listen(PORT, () => {
  console.log(`[NexIntent Engine] Live on Port ${PORT}`);
});
