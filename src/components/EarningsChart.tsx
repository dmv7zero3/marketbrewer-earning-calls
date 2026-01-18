import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface EarningsDataPoint {
  quarter: string;
  actual: number;
  estimate: number;
  surprise: number; // percentage
}

interface EarningsChartProps {
  data: EarningsDataPoint[];
  height?: number;
}

export function EarningsChart({ data, height = 200 }: EarningsChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const containerWidth = containerRef.current.clientWidth;
    const margin = { top: 20, right: 30, bottom: 40, left: 50 };
    const width = containerWidth - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg
      .attr('width', containerWidth)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const x = d3
      .scaleBand()
      .domain(data.map((d) => d.quarter))
      .range([0, width])
      .padding(0.3);

    const maxValue = Math.max(...data.flatMap((d) => [d.actual, d.estimate])) * 1.1;
    const minValue = Math.min(...data.flatMap((d) => [d.actual, d.estimate])) * 0.9;

    const y = d3.scaleLinear().domain([minValue, maxValue]).range([chartHeight, 0]);

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

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('fill', '#94a3b8')
      .attr('font-size', '11px');

    g.selectAll('.domain').attr('stroke', '#475569');
    g.selectAll('.tick line').attr('stroke', '#475569');

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('$.2f')))
      .selectAll('text')
      .attr('fill', '#94a3b8')
      .attr('font-size', '11px');

    // Estimate line
    const line = d3
      .line<EarningsDataPoint>()
      .x((d) => (x(d.quarter) || 0) + x.bandwidth() / 2)
      .y((d) => y(d.estimate));

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#64748b')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5')
      .attr('d', line);

    // Actual bars
    g.selectAll('.bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d) => x(d.quarter) || 0)
      .attr('y', (d) => y(Math.max(d.actual, d.estimate)))
      .attr('width', x.bandwidth())
      .attr('height', (d) => Math.abs(y(d.actual) - y(d.estimate)))
      .attr('fill', (d) => (d.surprise >= 0 ? '#22c55e' : '#ef4444'))
      .attr('opacity', 0.3);

    // Actual dots
    g.selectAll('.dot')
      .data(data)
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', (d) => (x(d.quarter) || 0) + x.bandwidth() / 2)
      .attr('cy', (d) => y(d.actual))
      .attr('r', 6)
      .attr('fill', (d) => (d.surprise >= 0 ? '#22c55e' : '#ef4444'))
      .attr('stroke', '#0f172a')
      .attr('stroke-width', 2);

    // Surprise labels
    g.selectAll('.surprise-label')
      .data(data)
      .enter()
      .append('text')
      .attr('class', 'surprise-label')
      .attr('x', (d) => (x(d.quarter) || 0) + x.bandwidth() / 2)
      .attr('y', (d) => y(d.actual) - 12)
      .attr('text-anchor', 'middle')
      .attr('fill', (d) => (d.surprise >= 0 ? '#22c55e' : '#ef4444'))
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .text((d) => `${d.surprise >= 0 ? '+' : ''}${d.surprise.toFixed(1)}%`);

    // Legend
    const legend = g.append('g').attr('transform', `translate(${width - 120}, -10)`);

    legend
      .append('circle')
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('r', 4)
      .attr('fill', '#22c55e');
    legend
      .append('text')
      .attr('x', 10)
      .attr('y', 4)
      .attr('fill', '#94a3b8')
      .attr('font-size', '10px')
      .text('Actual');

    legend
      .append('line')
      .attr('x1', 60)
      .attr('y1', 0)
      .attr('x2', 80)
      .attr('y2', 0)
      .attr('stroke', '#64748b')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '3,3');
    legend
      .append('text')
      .attr('x', 85)
      .attr('y', 4)
      .attr('fill', '#94a3b8')
      .attr('font-size', '10px')
      .text('Est.');
  }, [data, height]);

  return (
    <div ref={containerRef} className="w-full">
      <svg ref={svgRef} />
    </div>
  );
}

// Price history chart for Kalshi market prices
interface PriceDataPoint {
  timestamp: Date;
  yesPrice: number;
  volume: number;
}

interface PriceChartProps {
  data: PriceDataPoint[];
  height?: number;
}

export function PriceChart({ data, height = 150 }: PriceChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const containerWidth = containerRef.current.clientWidth;
    const margin = { top: 10, right: 30, bottom: 30, left: 40 };
    const width = containerWidth - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg
      .attr('width', containerWidth)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const x = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => d.timestamp) as [Date, Date])
      .range([0, width]);

    const y = d3.scaleLinear().domain([0, 100]).range([chartHeight, 0]);

    // Area gradient
    const gradient = svg
      .append('defs')
      .append('linearGradient')
      .attr('id', 'price-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#22c55e').attr('stop-opacity', 0.3);

    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#22c55e').attr('stop-opacity', 0);

    // Area
    const area = d3
      .area<PriceDataPoint>()
      .x((d) => x(d.timestamp))
      .y0(chartHeight)
      .y1((d) => y(d.yesPrice * 100));

    g.append('path').datum(data).attr('fill', 'url(#price-gradient)').attr('d', area);

    // Line
    const line = d3
      .line<PriceDataPoint>()
      .x((d) => x(d.timestamp))
      .y((d) => y(d.yesPrice * 100));

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#22c55e')
      .attr('stroke-width', 2)
      .attr('d', line);

    // 50% reference line
    g.append('line')
      .attr('x1', 0)
      .attr('y1', y(50))
      .attr('x2', width)
      .attr('y2', y(50))
      .attr('stroke', '#475569')
      .attr('stroke-dasharray', '3,3');

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.timeFormat('%b %d') as (d: Date | d3.NumberValue) => string))
      .selectAll('text')
      .attr('fill', '#94a3b8')
      .attr('font-size', '10px');

    // Y axis
    g.append('g')
      .call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickFormat((d) => `${d}¢`)
      )
      .selectAll('text')
      .attr('fill', '#94a3b8')
      .attr('font-size', '10px');

    g.selectAll('.domain').attr('stroke', '#475569');
    g.selectAll('.tick line').attr('stroke', '#475569');
  }, [data, height]);

  return (
    <div ref={containerRef} className="w-full">
      <svg ref={svgRef} />
    </div>
  );
}
