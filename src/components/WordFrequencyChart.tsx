import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface WordCount {
  word: string;
  count: number;
  inNews?: boolean; // Whether the word is trending in news
  newsCount?: number; // Number of news articles mentioning the word
}

interface WordFrequencyChartProps {
  data: WordCount[];
  height?: number;
  title?: string;
}

export function WordFrequencyChart({
  data,
  height = 250,
  title = 'Word Frequency',
}: WordFrequencyChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const containerWidth = containerRef.current.clientWidth;
    const margin = { top: 20, right: 20, bottom: 60, left: 40 };
    const width = containerWidth - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg
      .attr('width', containerWidth)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Sort by count descending, take top 15
    const sortedData = [...data].sort((a, b) => b.count - a.count).slice(0, 15);

    // Scales
    const x = d3
      .scaleBand()
      .domain(sortedData.map((d) => d.word))
      .range([0, width])
      .padding(0.2);

    const maxCount = Math.max(...sortedData.map((d) => d.count));
    const y = d3.scaleLinear().domain([0, maxCount]).range([chartHeight, 0]);

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3
          .axisLeft(y)
          .tickSize(-width)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', '#334155')
      .attr('stroke-opacity', 0.5);

    // Bars
    g.selectAll('.bar')
      .data(sortedData)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d) => x(d.word) || 0)
      .attr('y', (d) => y(d.count))
      .attr('width', x.bandwidth())
      .attr('height', (d) => chartHeight - y(d.count))
      .attr('fill', (d) => (d.inNews ? '#22c55e' : '#3b82f6'))
      .attr('rx', 4);

    // News indicator dots
    g.selectAll('.news-dot')
      .data(sortedData.filter((d) => d.inNews))
      .enter()
      .append('circle')
      .attr('class', 'news-dot')
      .attr('cx', (d) => (x(d.word) || 0) + x.bandwidth() / 2)
      .attr('cy', (d) => y(d.count) - 8)
      .attr('r', 4)
      .attr('fill', '#fbbf24');

    // Count labels
    g.selectAll('.count-label')
      .data(sortedData)
      .enter()
      .append('text')
      .attr('class', 'count-label')
      .attr('x', (d) => (x(d.word) || 0) + x.bandwidth() / 2)
      .attr('y', (d) => y(d.count) - 15)
      .attr('text-anchor', 'middle')
      .attr('fill', '#94a3b8')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .text((d) => d.count);

    // X axis with rotated labels
    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('fill', '#94a3b8')
      .attr('font-size', '10px')
      .attr('transform', 'rotate(-45)')
      .attr('text-anchor', 'end')
      .attr('dx', '-0.5em')
      .attr('dy', '0.5em');

    g.selectAll('.domain').attr('stroke', '#475569');
    g.selectAll('.tick line').attr('stroke', '#475569');

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(5))
      .selectAll('text')
      .attr('fill', '#94a3b8')
      .attr('font-size', '10px');
  }, [data, height]);

  return (
    <div ref={containerRef} className="w-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-blue-500" />
            <span className="text-slate-400">Transcript</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-profit-500" />
            <span className="text-slate-400">In News</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-yellow-400" />
            <span className="text-slate-400">Trending</span>
          </div>
        </div>
      </div>
      <svg ref={svgRef} />
    </div>
  );
}

// Word analysis utilities following Kalshi MENTION rules
export function analyzeTranscript(
  text: string,
  targetWords: string[]
): WordCount[] {
  const results: WordCount[] = [];

  for (const word of targetWords) {
    const count = countWordOccurrences(text, word);
    results.push({
      word,
      count,
      inNews: false, // Will be updated by news agent
      newsCount: 0,
    });
  }

  return results.sort((a, b) => b.count - a.count);
}

// Count occurrences following Kalshi MENTION rules
function countWordOccurrences(text: string, word: string): number {
  const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Pattern includes:
  // - Base word
  // - Plurals (s)
  // - Possessives ('s, s')
  // - Hyphenated compounds (pro-word)
  const pattern = new RegExp(
    `(?:^|[\\s.,!?;:"'([{])(${escapedWord}|${escapedWord}s|${escapedWord}'s|${escapedWord}s'|\\w+-${escapedWord})(?=[\\s.,!?;:"')\\]}]|$)`,
    'gi'
  );

  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

// Extract most frequent words from transcript (for discovery)
export function extractTopWords(
  text: string,
  minLength: number = 4,
  topN: number = 20
): WordCount[] {
  // Common words to exclude
  const stopWords = new Set([
    'the', 'and', 'that', 'this', 'with', 'from', 'have', 'been', 'were', 'they',
    'their', 'what', 'when', 'where', 'which', 'will', 'would', 'could', 'should',
    'about', 'there', 'these', 'those', 'than', 'then', 'them', 'into', 'some',
    'other', 'also', 'just', 'more', 'very', 'like', 'over', 'such', 'only',
    'year', 'years', 'quarter', 'think', 'going', 'really', 'well', 'know',
  ]);

  // Tokenize and count
  const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
  const counts: Record<string, number> = {};

  for (const word of words) {
    if (word.length >= minLength && !stopWords.has(word)) {
      counts[word] = (counts[word] || 0) + 1;
    }
  }

  // Convert to array and sort
  return Object.entries(counts)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}
