import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface TableData {
  [key: string]: any[];
}

const DatabaseDashboard = () => {
  const [data, setData] = useState<TableData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      const tables = [
        'departments',
        'subjects',
        'rooms',
        'exams',
        'profiles',
        'student_enrollments',
        'seating_arrangements'
      ] as const;

      const results: TableData = {};

      await Promise.all(
        tables.map(async (table) => {
          const { data, error } = await supabase
            .from(table)
            .select('*');
          
          if (error) throw new Error(`Error fetching ${table}: ${error.message}`);
          results[table] = data || [];
        })
      );

      setData(results);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const renderTable = (tableName: string, data: any[]) => {
    if (!data.length) return <p className="text-muted-foreground py-4">No data available</p>;

    const columns = Object.keys(data[0]);

    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col} className="whitespace-nowrap">
                  {col.replace(/_/g, ' ')}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, i) => (
              <TableRow key={i}>
                {columns.map((col) => (
                  <TableCell key={col}>
                    {typeof row[col] === 'boolean' ? (
                      row[col] ? '✓' : '✗'
                    ) : col.includes('_at') ? (
                      new Date(row[col]).toLocaleString()
                    ) : (
                      String(row[col] ?? '-')
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading database...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">Error: {error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-foreground">Database Dashboard</h1>
          <p className="text-sm text-muted-foreground">View and manage exam room data</p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold">Tables Overview</h2>
              <p className="text-sm text-muted-foreground">
                {Object.values(data).reduce((acc, curr) => acc + curr.length, 0)} total records across {Object.keys(data).length} tables
              </p>
            </div>
            <div className="flex gap-2">
              {Object.entries(data).map(([table, rows]) => (
                <Badge key={table} variant="secondary">
                  {table}: {rows.length}
                </Badge>
              ))}
            </div>
          </div>

          <Tabs defaultValue="departments" className="w-full">
            <TabsList>
              {Object.keys(data).map((table) => (
                <TabsTrigger key={table} value={table}>
                  {table.replace(/_/g, ' ')}
                </TabsTrigger>
              ))}
            </TabsList>

            {Object.entries(data).map(([table, rows]) => (
              <TabsContent key={table} value={table}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex justify-between">
                      <span>{table.replace(/_/g, ' ')}</span>
                      <Badge variant="outline">{rows.length} records</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {renderTable(table, rows)}
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default DatabaseDashboard;