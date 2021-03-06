import spray.json._
import DefaultJsonProtocol._

name := "magda-metadata"

lazy val packageJson = {
  // Ideally, the version of each component would come from the component's own
  // package.json.  But for now our version number's are synchronized anyway, so
  // just use the version in lerna.json.
  val source = scala.io.Source.fromFile("lerna.json").mkString
  val jsonAst = source.parseJson.asJsObject

   Map(
    "version" -> jsonAst.getFields("version").head.asInstanceOf[JsString].value
  )
}

lazy val commonSettings = Seq(
  organization := "au.csiro.data61",
  version := packageJson("version"),
  scalaVersion := "2.11.8"
)

lazy val root = (project in file("."))
  .aggregate(common, searchApi, indexer, registryApi, intTest)
  .settings(commonSettings: _*)
lazy val common = (project in file("magda-scala-common"))
  .settings(commonSettings: _*)
lazy val searchApi = (project in file("magda-search-api"))
  .settings(commonSettings: _*)
  .dependsOn(common % "test->test;compile->compile")
  .enablePlugins(sbtdocker.DockerPlugin, JavaServerAppPackaging)
lazy val indexer = (project in file("magda-indexer"))
  .settings(commonSettings: _*)
  .dependsOn(common % "test->test;compile->compile")
  .enablePlugins(sbtdocker.DockerPlugin, JavaServerAppPackaging)
lazy val registryApi = (project in file("magda-registry-api"))
  .settings(commonSettings: _*)
  .dependsOn(common)
  .enablePlugins(sbtdocker.DockerPlugin, JavaServerAppPackaging)
lazy val intTest = (project in file("magda-int-test"))
  .settings(commonSettings: _*)
  .dependsOn(indexer)
  .dependsOn(searchApi)
  .dependsOn(registryApi % "test->test;compile->compile")

EclipseKeys.withJavadoc := true
EclipseKeys.withSource := true
EclipseKeys.withBundledScalaContainers := false

Revolver.settings
Revolver.enableDebugging(port = 8000, suspend = false)

sources in EditSource <++= baseDirectory.map(d => (d / "deploy" / "kubernetes" ** "*.yml").get)
targetDirectory in EditSource <<= baseDirectory(_ / "target" / "kubernetes")
variables in EditSource += ("version", version.value)

concurrentRestrictions in Global += Tags.limit(Tags.Test, 1)
sbt.Keys.fork in Test := false

