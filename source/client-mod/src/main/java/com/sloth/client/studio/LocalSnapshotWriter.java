package com.sloth.client.studio;

import java.io.IOException;
import java.nio.file.*;
import java.util.UUID;
import java.util.concurrent.*;

/** Serial, bounded disk writes of already captured text; never touches game objects. */
public final class LocalSnapshotWriter {
    private static final ThreadPoolExecutor IO = new ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<>(4),r->{Thread t=new Thread(r,"Sloth local snapshots");t.setDaemon(true);return t;},new ThreadPoolExecutor.AbortPolicy());
    static { Runtime.getRuntime().addShutdownHook(new Thread(()->{IO.shutdown();try{IO.awaitTermination(3,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}},"Sloth snapshot shutdown")); }
    private LocalSnapshotWriter() {}
    public static CompletableFuture<Void> write(Path file,String content) {
        CompletableFuture<Void> result=new CompletableFuture<>();
        if(content==null||content.length()>1_000_000){result.completeExceptionally(new IOException("Snapshot exceeds limit"));return result;}
        try{IO.execute(()->{
            Path tmp=null;
            try{
                Path parent=file.toAbsolutePath().getParent();
                for(Path p=parent;p!=null;p=p.getParent())if(Files.isSymbolicLink(p))throw new IOException("Linked snapshot directory");
                Files.createDirectories(parent);
                if(Files.isSymbolicLink(file))throw new IOException("Linked snapshot file");
                tmp=parent.resolve(file.getFileName()+"-"+UUID.randomUUID()+".tmp");
                Files.writeString(tmp,content,StandardOpenOption.CREATE_NEW);
                try{Files.move(tmp,file,StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);}
                catch(AtomicMoveNotSupportedException e){Files.move(tmp,file,StandardCopyOption.REPLACE_EXISTING);}
                result.complete(null);
            }catch(Exception e){result.completeExceptionally(e);}
            finally{if(tmp!=null)try{Files.deleteIfExists(tmp);}catch(IOException ignored){}}
        });}catch(RejectedExecutionException e){result.completeExceptionally(e);}
        return result;
    }
}
