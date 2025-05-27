import express from 'express';
import { OpenAI } from 'openai';

const app = express();
app.use(express.json());

// ======= CONFIG ======= //
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); // Set env var

const PREDEFINED_CATEGORIES = [
    'Work', 'Personal', 'Promotions', 'Social', 'Spam', 'Unknown'
];

// Minimal in-memory vector store: [{title, embedding, category}]
const vectorStore: Array<{title: string, embedding: number[], category: string}> = [];

// ======= HELPERS ======= //
// Compute cosine similarity
function cosine(a, b) {
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const magA = Math.sqrt(a.reduce((s, v) => s + v*v, 0));
    const magB = Math.sqrt(b.reduce((s, v) => s + v*v, 0));
    return dot / (magA * magB);
}

async function embed(text: string) {
    const res = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
    });
    return res.data[0].embedding;
}

async function chooseCategory(title: string) {
    // Use GPT to pick from predefined categories
    const systemMsg = `You classify email subjects into one of the following categories: ${PREDEFINED_CATEGORIES.join(', ')}. Respond ONLY with the category.`;
    const result = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
            {role: 'system', content: systemMsg},
            {role: 'user', content: title}
        ],
        max_tokens: 10,
        temperature: 0,
    });
    return result.choices[0].message.content?.trim();
}

// ======= ROUTE ======= //

/**
 * POST /classify
 * { "emailTitle": "Your Amazon order shipped!" }
 */
app.post('/classify', async (req, res) => {
    const { emailTitle } = req.body;
    if (!emailTitle) return res.status(400).json({error: 'Missing emailTitle'});
    if (typeof emailTitle !== 'string') return res.status(400).json({error: 'emailTitle must be a string'});

    // Step 1: Create embedding
    const emb = await embed(emailTitle);

    // Step 2: Find similar (cosine > 0.8)
    const threshold = 0.8;
    let best = null, bestSim = 0;
    for (const entry of vectorStore) {
        const sim = cosine(emb, entry.embedding);
        if (sim > bestSim && sim > threshold) {
            best = entry;
            bestSim = sim;
        }
    }

    // Step 3: Category selection
    let category, info, needUserApproval = true;
    if (best) {
        category = best.category;
        info = `Similar subject found: "${best.title}". Classified as "${category}".`;
        needUserApproval = false; // Already classified before
    } else {
        // No similar: Ask model
        category = await chooseCategory(emailTitle);
        info = 'No similar subject found. Model proposes a new category.';
        // Save in store for next time:
        vectorStore.push({title: emailTitle, category: category || 'Unknown', embedding: emb});
        // User should approve this
        needUserApproval = true;
    }

    // Respond
    res.json({
        emailTitle,
        proposedCategory: category,
        info,
        needUserApproval
    });
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
