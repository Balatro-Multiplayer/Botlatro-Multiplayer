// turns log of queue transcript into json body 
export async function parseLogLines(lines: string[]) {
    try {
        return lines
            .map(line => {
                const match = line.match(/^\[(.*?)\]\s+([^:]+):\s+(.*)$/);
                if (!match) return null;
                const content = match[3].replace(/https:\/\/\S+/g, '').trim();
                const attachments = match[3].match(/https:\/\/\S+/g) || [];
                return {
                    date: match[1],
                    name: match[2],
                    content: content,
                    attachments: attachments
                };
            })
            .filter(Boolean); 
        } catch (error) {
            console.error("Error parsing log lines:", error);
            return [];
        }
}