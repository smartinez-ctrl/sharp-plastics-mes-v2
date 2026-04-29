export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { po, mockup } = req.body;
    if (!po || !mockup) return res.status(400).json({ error: 'Faltan los PDFs' });

    const prompt = `Analiza estos dos PDFs de un pedido de botellas de plástico impresas y extrae la información en JSON exacto sin texto adicional ni backticks:
{
  "sub_cliente": "nombre del sub-cliente bajo Ship To (primera línea solamente, ej: Peaked Sports, Wheel Wranglers, C/O Mountainflow)",
  "po": "solo el número al final del PO#. El PO# tiene formato MF-NombreCliente-XXXml-NÚMERO. Extrae SOLO el número final, ej: 435742527",
  "capacidad": 600,
  "piezas": 205,
  "fecha_pedido": "2026-04-23",
  "direccion_envio": "dirección completa bajo Ship To incluyendo nombre, calle, ciudad, estado y país",
  "color_botella": "color exacto de BOTTLE o COLOR OF BOTTLE. Si dice See Mock Up, busca en el Mock Up el color de la botella",
  "color_tapa": "color exacto de TOP o COLOR OF THE BOTTLE TOP. Si dice See Mock Up, busca en el Mock Up",
  "color_boquilla": "color exacto de MOUTHPIECE. Si dice See Mock Up, busca en el Mock Up",
  "tintas": ["color1", "color2"],
  "num_colores": 2,
  "notas_packaging": "texto completo de PACKAGING"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: po } },
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: mockup } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: 'Anthropic error: ' + JSON.stringify(data) });
    }
    if (!data.content || !data.content[0]) {
      return res.status(500).json({ error: 'Respuesta vacía: ' + JSON.stringify(data) });
    }

    const text = data.content[0].text.replace(/```json|```/g, '').trim();
    let extracted;
    try {
      extracted = JSON.parse(text);
    } catch(e) {
      return res.status(500).json({ error: 'JSON inválido: ' + text.substring(0, 300) });
    }

    return res.status(200).json(extracted);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
