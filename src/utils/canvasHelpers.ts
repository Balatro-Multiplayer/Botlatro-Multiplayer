import { Canvas, CanvasRenderingContext2D } from 'skia-canvas';
import * as fs from 'fs';
import * as path from 'path';

// --- Configuration & Data ---
const config = {
    width: 712,
    height: 585,
    padding: 20,
    colors: {
        background: '#19191a',
        panel: '#282b30',
        gridLines: '#424549',
        textPrimary: '#ffffff',
        textSecondary: '#b0b3b8',
        textTertiary: '#72767d',
        accent: '#4a4e54',
        win: '#00ff3c',
        lose: '#f52020',
        graphLine: '#f31919',
    },
    fonts: {
        ui: 'Arial',
        title: 'bold 70px Arial',
        value: 'bold 42px Arial',
        label: 'bold 16px Arial',
        small: '14px Arial',
        percentile: 'bold 12px Arial',
        gameList: 'bold 15px Arial',
    },
};

// --- Mock Data ---
const playerData = {
    name: 'Jeffdev',
    mmr: '57.0',
    peak_mmr: '273.3',
    stats: [
        { label: 'RANK', value: '#302', percentile: 'BOTTOM 2.3%' },
        { label: 'WINRATE', value: '22%', percentile: 'BOTTOM 44%' },
        { label: 'STREAK', value: '3', percentile: 'TOP 1.7%' },
        { label: 'WINS', value: '5', percentile: 'TOP 18%' },
        { label: 'LOSSES', value: '18', percentile: 'BOTTOM 2.6%' },
        { label: 'GAMES', value: '23', percentile: 'TOP 6.5%' },
    ],
    previousGames: [
        { result: 'WIN', change: '+27.6', time: '2 days ago' },
        { result: 'WIN', change: '+29.4', time: '2 days ago' },
        { result: 'LOSE', change: '-20.0', time: '4 days ago' },
        { result: 'LOSE', change: '-20.0', time: '4 days ago' },
        { result: 'LOSE', change: '-20.0', time: '5 days ago' },
        { result: 'LOSE', change: '-20.0', time: '5 days ago' },
        { result: 'LOSE', change: '-20.0', time: '7 days ago' },
    ],
    graphData: [
        { date: '08/16', rating: 170 }, { rating: 120 },
        { date: '08/18', rating: 50 },  { rating: 35 },
        { date: '08/20', rating: 55 },  { rating: 35 },
        { date: '08/22', rating: 2 },   { rating: 3 },
        { date: '08/24', rating: 3 },   { rating: 3 },
        { date: '08/26', rating: 2 },   { rating: 15 },
        { date: '08/28', rating: 40 },  { rating: 58 },
    ],
};

// --- Drawing Functions ---

function drawBackground(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = config.colors.background;
    ctx.fillRect(0, 0, config.width, config.height);

    ctx.fillStyle = config.colors.panel;
    // Top panel
    ctx.fillRect(0, 0, config.width, 140);
    // Middle panel
    ctx.fillRect(config.padding, 160, config.width - config.padding * 2, 200);
    // Bottom panel
    ctx.fillRect(config.padding, 380, config.width - config.padding * 2, config.height - 400);
}

function drawAvatar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    ctx.save();
    // Simple placeholder avatar
    ctx.fillStyle = '#6a8a3a'; // Green background
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#d4aa69'; // Face color
    ctx.fillRect(x + size * 0.2, y + size * 0.3, size * 0.6, size * 0.5);
    ctx.fillStyle = '#000000'; // Eyes
    ctx.fillRect(x + size * 0.3, y + size * 0.45, size * 0.1, size * 0.1);
    ctx.fillRect(x + size * 0.6, y + size * 0.45, size * 0.1, size * 0.1);
    ctx.restore();
}

function drawHeader(ctx: CanvasRenderingContext2D) {
    const { padding } = config;

    // Avatar
    drawAvatar(ctx, padding + 10, 35, 70);

    // Player Name
    ctx.textAlign = 'left';
    ctx.font = config.fonts.label;
    ctx.fillStyle = config.colors.textSecondary;
    ctx.fillText('PLAYER', padding + 98, 45);

    ctx.font = config.fonts.title;
    ctx.fillStyle = config.colors.textPrimary;
    ctx.textBaseline = 'middle';
    ctx.fillText(playerData.name, padding + 95, 80);

    // MMR
    ctx.textAlign = 'right';

    ctx.font = config.fonts.label;
    ctx.fillStyle = config.colors.textSecondary;
    ctx.fillText('MMR', config.width - padding - 20, 40);

    ctx.font = config.fonts.title;
    ctx.fillStyle = config.colors.textPrimary;
    ctx.fillText(playerData.mmr, config.width - padding - 20, 80);

    ctx.font = config.fonts.small;
    ctx.fillStyle = config.colors.textTertiary;
    ctx.fillText(playerData.peak_mmr, config.width - padding - 20, 100);

    ctx.textAlign = 'left';
}

function drawStats(ctx: CanvasRenderingContext2D) {
    const { padding } = config;
    const startX = padding;
    const startY = 160;
    const panelWidth = 450;

    const cellWidth = panelWidth / 3;
    const cellHeight = 200 / 2;

    // Draw vertical divider lines
    ctx.strokeStyle = config.colors.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX + cellWidth, startY + 20);
    ctx.lineTo(startX + cellWidth, startY + 180);
    ctx.moveTo(startX + cellWidth * 2, startY + 20);
    ctx.lineTo(startX + cellWidth * 2, startY + 180);
    ctx.stroke();

    playerData.stats.forEach((stat, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const cellX = startX + col * cellWidth;
        const cellY = startY + row * cellHeight;

        // Label
        ctx.font = config.fonts.label;
        ctx.fillStyle = config.colors.textSecondary;
        ctx.fillText(stat.label, cellX + 10, cellY + 25);

        // Value
        ctx.font = config.fonts.value;
        ctx.fillStyle = config.colors.textPrimary;
        ctx.fillText(stat.value, cellX + 10, cellY + 55);

        // Percentile
        ctx.font = config.fonts.percentile;
        ctx.fillStyle = config.colors.textTertiary;
        ctx.fillText(stat.percentile, cellX + 10, cellY + 85);
    });
}

function drawPreviousGames(ctx: CanvasRenderingContext2D) {
    const statsPanelWidth = 450;
    const spacing = -10; 
    const startX = config.padding + statsPanelWidth + spacing; 
    const startY = 160;
    const panelWidth = config.width - startX - config.padding;

    // Panel background
    ctx.fillStyle = config.colors.panel;
    ctx.fillRect(startX - 10, startY, panelWidth, 200);

    // Label
    ctx.font = config.fonts.label;
    ctx.fillStyle = config.colors.textSecondary;
    ctx.fillText('PREVIOUS GAMES', startX, startY + 25);

    // Game List
    ctx.font = config.fonts.gameList;
    const lineHeight = 22;
    playerData.previousGames.forEach((game, i) => {
        const y = startY + 50 + i * lineHeight;
        const numberText = `${i + 1}.`;
        const resultText = `${game.result}`;
        const changeText = game.change;

        // Result
        ctx.fillStyle = config.colors.textPrimary;
        ctx.fillText(numberText, startX, y);

        // Result
        ctx.fillStyle = game.result === 'WIN' ? config.colors.win : config.colors.lose;
        const numberWidth = ctx.measureText(numberText).width;
        ctx.fillText(resultText, startX + numberWidth + 5, y);

        // Change
        const resultWidth = ctx.measureText(resultText).width;
        ctx.fillText(changeText, startX + resultWidth + numberWidth + 13, y);

        // Time
        ctx.fillStyle = config.colors.textTertiary;
        ctx.textAlign = 'right';
        ctx.fillText(game.time, startX + panelWidth - 35, y);
        ctx.textAlign = 'left'; // Reset
    });
}

function drawGraph(ctx: CanvasRenderingContext2D) {
    const { padding } = config;
    const area = {
        x: padding + 65,
        y: 395,
        width: config.width - padding * 2 - 100,
        height: config.height - 400 - 50,
    };

    const data = playerData.graphData;
    const maxRating = 175; 

    // --- Draw Grid and Labels ---
    ctx.strokeStyle = config.colors.gridLines;
    ctx.lineWidth = 1;
    ctx.font = config.fonts.small;
    ctx.fillStyle = config.colors.textSecondary;
    ctx.textAlign = 'right';

    // Horizontal grid lines and Y-axis labels
    for (let i = 0; i <= maxRating; i += 25) {
        if (i === 0) continue;
        const y = area.y + area.height - (i / maxRating) * area.height;
        ctx.beginPath();
        ctx.moveTo(area.x, y);
        ctx.lineTo(area.x + area.width, y);
        ctx.stroke();
        ctx.fillText(i.toString(), area.x - 10, y + 4);
    }
    
    // Y-axis Title
    ctx.save();
    ctx.translate(padding + 15, area.y + area.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = config.fonts.label;
    ctx.fillStyle = config.colors.textSecondary;
    ctx.textAlign = 'center';
    ctx.fillText('RATING', 0, 0);
    ctx.restore();

    // Vertical grid lines and X-axis labels
    ctx.textAlign = 'center';
    data.forEach((point, i) => {
        const x = area.x + (i / (data.length - 1)) * area.width;
        
        ctx.beginPath();
        ctx.moveTo(x, area.y);
        ctx.lineTo(x, area.y + area.height);
        ctx.stroke();

        ctx.font = config.fonts.small;
        ctx.fillStyle = config.colors.textTertiary;
        ctx.fillText((i+1).toString(), x, area.y + area.height + 20);
    });

    // Draw the Line and Points
    ctx.strokeStyle = config.colors.graphLine;
    ctx.fillStyle = config.colors.graphLine;
    ctx.lineWidth = 2.5;
    ctx.beginPath();

    data.forEach((point, i) => {
        const x = area.x + (i / (data.length - 1)) * area.width;
        const y = area.y + area.height - (point.rating / maxRating) * area.height;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();
    
    // Draw border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5; 
    ctx.strokeRect(area.x, area.y, area.width, area.height);

    // Draw points on top of the line
    data.forEach((point, i) => {
        const x = area.x + (i / (data.length - 1)) * area.width;
        const y = area.y + area.height - (point.rating / maxRating) * area.height;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
    });
}


// --- Main Execution ---

async function main() {
    const canvas = new Canvas(config.width, config.height);
    const ctx = canvas.getContext('2d');

    // Drawing calls in order
    drawBackground(ctx);
    drawHeader(ctx);
    drawStats(ctx);
    drawPreviousGames(ctx);
    drawGraph(ctx);

    // Save the file
    const outputPath = './player-stats.png';
    fs.writeFileSync(outputPath, await canvas.toBuffer('png'));

    console.log(`Image saved successfully to ${outputPath}`);
}

main().catch(console.error);