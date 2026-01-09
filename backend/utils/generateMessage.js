import fetch from 'node-fetch';

export default async function generateMessage(lead, template, openaiKey) {
  // If OpenAI key provided, always generate a personalized message per lead using the template as an instruction.
  if (openaiKey) {
    try {
      const baseTemplate = (template && String(template).trim().length > 0) ? String(template).trim() : null;
      const promptParts = [];
      if (baseTemplate) {
        promptParts.push(`Use this template or instruction to craft the message:\n---\n${baseTemplate}\n---\n`);
      } else {
        promptParts.push('Write a friendly, concise outreach direct message (1-3 sentences).');
      }
      promptParts.push(`Personalize for this lead with the following context:\nName: ${lead.name || ''}\nRole: ${lead.role || ''}\nCompany: ${lead.company || ''}\nJobTitle: ${lead.jobTitle || ''}`);
      promptParts.push('Keep it natural, avoid generic phrases, and do not include marketing links. Return only the message text.');

      const prompt = promptParts.join('\n\n');

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({ model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: prompt }], max_tokens: 200 }),
      });
      const data = await res.json();
      if (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
        return data.choices[0].message.content.trim();
      }
    } catch (e) {
      console.error('generateMessage OpenAI error', e && e.message ? e.message : e);
    }
  }

  // If no OpenAI key or the call failed, fall back to simple templating or a basic message.
  if (template && template.trim().length > 0) {
    return template
      .replace(/\{\{name\}\}/g, lead.name || '')
      .replace(/\{\{company\}\}/g, lead.company || '')
      .replace(/\{\{role\}\}/g, lead.role || '')
      .replace(/\{\{jobTitle\}\}/g, lead.jobTitle || '');
  }

  return `Hi ${lead.name || ''}, I came across your profile and wanted to connect — would love to learn about your work at ${lead.company || ''}.`;
}
