package au.csiro.data61.magda.indexer.search

import au.csiro.data61.magda.model.misc._

import scala.concurrent.{ ExecutionContext, Future }
import akka.stream.Materializer
import akka.actor.ActorSystem
import au.csiro.data61.magda.indexer.external.InterfaceConfig
import au.csiro.data61.magda.search.elasticsearch.{ ClientProvider, Indices }
import com.typesafe.config.Config
import java.time.Instant
import akka.stream.scaladsl.Source
import akka.NotUsed
import java.time.OffsetDateTime
import au.csiro.data61.magda.indexer.search.elasticsearch.ElasticSearchIndexer

trait SearchIndexer {
  def index(source: InterfaceConfig, dataSetStream: Source[DataSet, NotUsed]): Future[SearchIndexer.IndexResult]
  def snapshot(): Future[Unit]
  def ready: Future[Unit]
  def trim(source: InterfaceConfig, before: OffsetDateTime): Future[Unit]

}

object SearchIndexer {
  case class IndexResult(successes: Long, failures: Seq[String])
  
  def apply(clientProvider: ClientProvider, indices: Indices)(implicit config: Config, system: ActorSystem, ec: ExecutionContext, materializer: Materializer) =
    new ElasticSearchIndexer(clientProvider, indices)
}