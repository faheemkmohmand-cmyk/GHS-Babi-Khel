import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

interface ChapterChartProps {
  config?: {
    type?: "line" | "bar" | "area" | "pie";
    title?: string;
    equation?: string;
    data?: any[];
    xKey?: string;
    yKey?: string;
    colors?: string[];
  } | null;
}

const ChapterChart = ({ config }: ChapterChartProps) => {
  if (!config) return null;

  const { type = "line", title, equation, data: providedData, xKey = "x", yKey = "y", colors = ["#3B82F6", "#EF4444", "#10B981", "#1e3a8a"] } = config;

  let data = providedData || [];

  if (equation && !providedData) {
    data = [];
    for (let x = -10; x <= 10; x += 0.5) {
      try {
        const safeMath = {
          sin: Math.sin,
          cos: Math.cos,
          tan: Math.tan,
          sqrt: Math.sqrt,
          abs: Math.abs,
          pow: Math.pow,
          log: Math.log,
          exp: Math.exp,
          PI: Math.PI,
          E: Math.E,
        };
        const evaluator = new Function("x", "Math", `
          const { sin, cos, tan, sqrt, abs, pow, log, exp, PI, E } = Math;
          try {
            return ${equation.replace(/\^/g, "**").replace(/sin\(/g, "Math.sin(").replace(/cos\(/g, "Math.cos(").replace(/tan\(/g, "Math.tan(").replace(/sqrt\(/g, "Math.sqrt(")};
          } catch {
            return null;
          }
        `);
        const y = evaluator(x, Math);
        if (y !== null && !isNaN(y) && isFinite(y)) {
          data.push({ x: parseFloat(x.toFixed(2)), y: parseFloat(y.toFixed(4)) });
        }
      } catch {}
    }
  }

  if (!data.length) {
    return (
      <div className="mt-8 p-6 bg-secondary/30 rounded-2xl text-center text-muted-foreground">
        No chart data available
      </div>
    );
  }

  const commonProps = {
    width: "100%",
    height: 320,
    margin: { top: 5, right: 30, left: 0, bottom: 5 },
  };

  return (
    <div className="mt-8">
      {title && <h3 className="text-lg font-bold text-foreground mb-3">{title}</h3>}
      <div className="bg-white dark:bg-zinc-900 border border-border rounded-2xl p-4 overflow-x-auto">
        <ResponsiveContainer {...commonProps as any}>
          {(type === "line" ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={xKey} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey={yKey} stroke={colors[0]} dot={false} isAnimationActive={false} />
            </LineChart>
          ) : type === "bar" ? (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={xKey} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey={yKey} fill={colors[0]} isAnimationActive={false} />
            </BarChart>
          ) : type === "area" ? (
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={xKey} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey={yKey} fill={colors[0]} stroke={colors[0]} isAnimationActive={false} />
            </AreaChart>
          ) : (
            <PieChart>
              <Pie data={data} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%" outerRadius={100} label>
                {data.map((_, idx) => <Cell key={`cell-${idx}`} fill={colors[idx % colors.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          )) as any}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ChapterChart;
