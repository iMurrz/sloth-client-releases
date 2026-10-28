import com.sloth.client.studio.LocalSnapshotWriter;
import java.nio.file.*;
import java.util.concurrent.*;
public final class PerformanceWriterCheck {
    public static void main(String[] args)throws Exception{
        Path root=Path.of(args[0]),file=root.resolve("nested/sample.json");
        LocalSnapshotWriter.write(file,"first").get(5,TimeUnit.SECONDS);
        if(!Files.readString(file).equals("first"))throw new AssertionError("First snapshot missing");
        var one=LocalSnapshotWriter.write(file,"second");var two=LocalSnapshotWriter.write(file,"third");
        one.get(5,TimeUnit.SECONDS);two.get(5,TimeUnit.SECONDS);
        if(!Files.readString(file).equals("third"))throw new AssertionError("Writes reordered");
        try{LocalSnapshotWriter.write(file,"x".repeat(1_000_001)).join();throw new AssertionError("Oversize accepted");}catch(CompletionException expected){}
        if(!Files.readString(file).equals("third"))throw new AssertionError("Rejected write changed file");
        try(var entries=Files.list(file.getParent())){if(entries.anyMatch(p->p.getFileName().toString().endsWith(".tmp")))throw new AssertionError("Temporary file retained");}
        System.out.println("PASS: create, replace, FIFO order, size rejection, preservation and temp cleanup");
    }
}
