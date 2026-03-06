import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function AdminTools() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const { toast } = useToast();

  const handleCleanupDatabase = async () => {
    if (!confirm("This will clean up duplicate BOL documents in the database. This action cannot be undone. Continue?")) {
      return;
    }

    setLoading(true);
    setResult(null);
    
    try {
      const response = await fetch('/api/documents/cleanup-database', {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: "Cleanup Successful",
          description: data.message,
        });
        setResult(`Successfully cleaned up ${data.deletedCount} duplicate BOL documents`);
      } else {
        toast({
          title: "Cleanup Failed",
          description: data.error || "An unknown error occurred",
          variant: "destructive",
        });
        setResult(`Error: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error cleaning up database:", error);
      toast({
        title: "Cleanup Failed",
        description: "An error occurred while cleaning up the database",
        variant: "destructive",
      });
      setResult(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Database Maintenance</CardTitle>
        <CardDescription>
          Tools for maintaining and fixing the database
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2">
          <Button 
            variant="destructive" 
            onClick={handleCleanupDatabase} 
            disabled={loading}
            className="w-full flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            {loading ? "Cleaning up..." : "Clean Up Duplicate BOL Documents"}
          </Button>
          <p className="text-sm text-muted-foreground">
            This will find and delete duplicate Bill of Lading documents with the same BOL number, 
            keeping only the most recently created record.
          </p>
        </div>
        
        {result && (
          <Alert variant={result.startsWith("Error") ? "destructive" : "default"}>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Cleanup Result</AlertTitle>
            <AlertDescription>
              {result}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
} 