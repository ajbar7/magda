import { Record } from './generated/registry/api';
import AspectBuilder from './AspectBuilder';
import AsyncPage, { forEachAsync } from './AsyncPage';
import ConnectionResult from './ConnectionResult';
import createServiceError from './createServiceError';
import CreationFailure from './CreationFailure';
import Registry from './Registry';

/**
 * A base class for connectors for most any JSON-based catalog source.
 */
export default abstract class JsonConnector {
    private source: IConnectorSource;
    private registry: Registry;
    private libraries: object;
    private maxConcurrency: number;
    private organizationAspects: CompiledAspects;
    private datasetAspects: CompiledAspects;
    private distributionAspects: CompiledAspects;
    private datasetAspectBuilders: AspectBuilder[];
    private distributionAspectBuilders: AspectBuilder[];
    private organizationAspectBuilders: AspectBuilder[];

    constructor({
        source,
        registry,
        libraries = {},
        maxConcurrency = 6,
        datasetAspectBuilders = [],
        distributionAspectBuilders = [],
        organizationAspectBuilders = []
    }: JsonConnectorOptions) {
        this.source = source;
        this.registry = registry;
        this.libraries = libraries;
        this.maxConcurrency = maxConcurrency;
        this.datasetAspectBuilders = datasetAspectBuilders.slice();
        this.distributionAspectBuilders = distributionAspectBuilders.slice();
        this.organizationAspectBuilders = organizationAspectBuilders.slice();

        const setupParameters: BuilderSetupFunctionParameters = {
            source: this.source,
            connector: this,
            registry: this.registry,
            libraries
        };

        const datasetParameters = new DatasetBuilderFunctionParameters();
        datasetParameters.libraries = libraries;
        datasetParameters.source = this.source;
        datasetParameters.connector = this;
        datasetParameters.registry = this.registry;

        const distributionParameters = new DistributionBuilderFunctionParameters();
        distributionParameters.libraries = libraries;
        distributionParameters.source = this.source;
        distributionParameters.connector = this;
        distributionParameters.registry = this.registry;

        const organizationParameters = new OrganizationBuilderFunctionParameters();
        organizationParameters.libraries = libraries;
        organizationParameters.source = this.source;
        organizationParameters.connector = this;
        organizationParameters.registry = this.registry;

        this.datasetAspects = buildersToCompiledAspects(datasetAspectBuilders, setupParameters, datasetParameters);
        this.distributionAspects = buildersToCompiledAspects(distributionAspectBuilders, setupParameters, distributionParameters);
        this.organizationAspects = buildersToCompiledAspects(organizationAspectBuilders, setupParameters, organizationParameters);
    }

    /**
     * Create a {@link Record} from JSON data representing an organization.
     *
     * @param {string} id The ID of the record.
     * @param {string} name The name of the record.
     * @param {object} jsonOrganization The JSON data representing the organization.
     * @returns {Record} The record.
     *
     * @memberof JsonConnector
     */
    organizationJsonToRecord(jsonOrganization: object): Record {
        this.organizationAspects.parameters.organization = jsonOrganization;

        const id = this.getIdFromJsonOrganization(jsonOrganization);
        const name = this.getNameFromJsonOrganization(jsonOrganization);
        return this.jsonToRecord(id, name, jsonOrganization, this.organizationAspects);
    }

    datasetJsonToRecord(jsonDataset: object): Record {
        this.datasetAspects.parameters.dataset = jsonDataset;

        const id = this.getIdFromJsonDataset(jsonDataset);
        const name = this.getNameFromJsonDataset(jsonDataset);
        return this.jsonToRecord(id, name, jsonDataset, this.datasetAspects);
    }

    distributionJsonToRecord(jsonDistribution: object, jsonDataset: object): Record {
        this.distributionAspects.parameters.dataset = jsonDataset;
        this.distributionAspects.parameters.distribution = jsonDistribution;

        const id = this.getIdFromJsonDistribution(jsonDistribution, jsonDataset);
        const name = this.getNameFromJsonDistribution(jsonDistribution, jsonDataset);
        return this.jsonToRecord(id, name, jsonDistribution, this.distributionAspects);
    }

    protected abstract getJsonOrganizations(): AsyncPage<object[]>;
    protected abstract getJsonDatasets(): AsyncPage<object[]>;
    protected abstract getJsonDistributions(dataset: object): AsyncPage<object[]>;
    protected abstract getJsonDatasetPublisher(dataset: object): string | object;

    protected abstract getIdFromJsonOrganization(jsonOrganization: object): string;
    protected abstract getIdFromJsonDataset(jsonDataset: object): string;
    protected abstract getIdFromJsonDistribution(jsonDistribution: object, jsonDataset: object): string;

    protected abstract getNameFromJsonOrganization(jsonOrganization: object): string;
    protected abstract getNameFromJsonDataset(jsonDataset: object): string;
    protected abstract getNameFromJsonDistribution(jsonDistribution: object, jsonDataset: object): string;

    async createAspectDefinitions(): Promise<ConnectionResult> {
        const result = new ConnectionResult();

        const allAspects = this.datasetAspectBuilders.concat(this.distributionAspectBuilders).concat(this.organizationAspectBuilders).concat([
            {
                aspectDefinition: {
                    id: 'dataset-distributions',
                    name: 'Dataset Distributions',
                    jsonSchema: require('@magda/registry-aspects/dataset-distributions.schema.json')
                },
                builderFunctionString: undefined
            },
            {
                aspectDefinition: {
                    id: 'source',
                    name: 'Source',
                    jsonSchema: require('@magda/registry-aspects/source.schema.json')
                },
                builderFunctionString: undefined
            },
            {
                aspectDefinition: {
                    id: 'dataset-publisher',
                    name: 'Dataset Publisher',
                    jsonSchema: require('@magda/registry-aspects/dataset-publisher.schema.json')
                },
                builderFunctionString: undefined
            }
        ]);

        const aspectBuilderPage = AsyncPage.single<AspectBuilder[]>(allAspects);
        await forEachAsync(aspectBuilderPage, this.maxConcurrency, async aspectBuilder => {
            const aspectDefinitionOrError = await this.registry.putAspectDefinition(aspectBuilder.aspectDefinition);
            if (aspectDefinitionOrError instanceof Error) {
                result.aspectDefinitionFailures.push(new CreationFailure(aspectBuilder.aspectDefinition.id, undefined, aspectDefinitionOrError));
            } else {
                ++result.aspectDefinitionsConnected;
            }
        });

        return result;
    }

    async createOrganization(organizationJson: object): Promise<Record | Error> {
        return this.registry.putRecord(this.organizationJsonToRecord(organizationJson));
    }

    async createDataset(datasetJson: object): Promise<Record | Error> {
        return this.registry.putRecord(this.datasetJsonToRecord(datasetJson));
    }

    async createDistribution(distributionJson: object, datasetJson: object): Promise<Record | Error> {
        return this.registry.putRecord(this.distributionJsonToRecord(distributionJson, datasetJson));
    }

    async createOrganizations(): Promise<ConnectionResult> {
        const result = new ConnectionResult();

        const organizations = this.getJsonOrganizations();
        await forEachAsync(organizations, this.maxConcurrency, async organization => {
            const recordOrError = await this.createOrganization(organization);
            if (recordOrError instanceof Error) {
                result.organizationFailures.push(new CreationFailure(
                    this.getIdFromJsonOrganization(organization),
                    undefined,
                    recordOrError));
            } else {
                ++result.organizationsConnected;
            }
        });

        return result;
    }

    async createDatasetsAndDistributions(): Promise<ConnectionResult> {
        const result = new ConnectionResult();

        const datasets = this.getJsonDatasets();
        await forEachAsync(datasets, this.maxConcurrency, async dataset => {
            const record = this.datasetJsonToRecord(dataset);

            const distributions = this.getJsonDistributions(dataset);
            if (distributions) {
                const distributionIds: string[] = [];
                await forEachAsync(distributions, 1, async distribution => {
                    const recordOrError = await this.createDistribution(distribution, dataset);
                    if (recordOrError instanceof Error) {
                        result.distributionFailures.push(new CreationFailure(
                            this.getIdFromJsonDistribution(distribution, dataset),
                            this.getIdFromJsonDataset(dataset),
                            recordOrError));
                    } else {
                        ++result.distributionsConnected;
                        distributionIds.push(this.getIdFromJsonDistribution(distribution, dataset));
                    }
                });

                record.aspects['dataset-distributions'] = {
                    distributions: distributionIds
                };
            }

            const publisher = this.getJsonDatasetPublisher(dataset);
            if (typeof publisher === 'string' || publisher instanceof String) {
                record.aspects['dataset-publisher'] = {
                    publisher: publisher
                };
            } else if (typeof publisher === 'object') {
                const recordOrError = await this.createOrganization(publisher);
                if (recordOrError instanceof Error) {
                    result.organizationFailures.push(new CreationFailure(
                        this.getIdFromJsonOrganization(publisher),
                        undefined,
                        recordOrError));
                } else {
                    record.aspects['dataset-publisher'] = {
                        publisher: this.getIdFromJsonOrganization(publisher)
                    };
                    ++result.organizationsConnected;
                }
            }

            const recordOrError = await this.registry.putRecord(record);
            if (recordOrError instanceof Error) {
                result.datasetFailures.push(new CreationFailure(
                    this.getIdFromJsonDataset(dataset),
                    undefined,
                    recordOrError));
            } else {
                ++result.datasetsConnected;
            }
        });

        return result;
    }

    /**
     * Runs the connector, creating aspect definitions, organizations, datasets, and distributions in the
     * registry as necessary.
     *
     * @returns {Promise<ConnectionResult>}
     * @memberof JsonConnector
     */
    async run(): Promise<ConnectionResult> {
        const aspectResult = await this.createAspectDefinitions();
        const organizationResult = await this.createOrganizations();
        const datasetAndDistributionResult = await this.createDatasetsAndDistributions();
        return ConnectionResult.combine(aspectResult, organizationResult, datasetAndDistributionResult);
    }

    private jsonToRecord(id: string, name: string, json: any, aspects: CompiledAspects): Record {
        const problems: ProblemReport[] = [];

        function reportProblem(title: string, message?: string, additionalInfo?: any) {
            problems.push({ title, message, additionalInfo });
        }

        aspects.parameters.reportProblem = reportProblem;

        const generatedAspects: Aspects = {};
        aspects.aspects.forEach(aspect => {
            try {
                aspects.parameters.setup = aspect.setupResult;
                const aspectValue = aspect.builderFunction(...aspects.parameterNames.map(parameter => aspects.parameters[parameter]));
                if (aspectValue !== undefined) {
                    generatedAspects[aspect.id] = aspectValue;
                }
            } catch(e) {
                const exception = createServiceError(e);
                reportProblem('Exception while creating aspect ' + aspect.id, exception.toString());
            }
        });

        if (!generatedAspects['source']) {
            generatedAspects['source'] = {};
        }

        if (problems.length > 0) {
            generatedAspects['source'].problems = problems;
        } else {
            generatedAspects['source'].problems = undefined;
        }

        return {
            id: id,
            name: name,
            aspects: generatedAspects
        };
    }
}

function buildersToCompiledAspects(builders: AspectBuilder[], setupParameters: BuilderSetupFunctionParameters, buildParameters: BuilderFunctionParameters): CompiledAspects {
    const setupParameterNames = Object.keys(setupParameters);
    const buildParameterNames = Object.keys(buildParameters);

    return {
        parameterNames: buildParameterNames,
        parameters: buildParameters,
        aspects: builders.map(builder => {
            let setupResult = undefined;
            if (builder.setupFunctionString) {
                const setupFunction = new Function(...setupParameterNames, builder.setupFunctionString);
                const setupParametersUntyped: any = setupParameters;
                setupResult = setupFunction.apply(undefined, setupParameterNames.map(name => setupParametersUntyped[name]));
            }

            const builderFunction = new Function(...buildParameterNames, builder.builderFunctionString);

            return {
                id: builder.aspectDefinition.id,
                builderFunction: builderFunction,
                setupResult: setupResult
            };
        })
    };
}

export interface IConnectorSource {
}

export interface JsonConnectorOptions {
    source: IConnectorSource,
    registry: Registry,
    libraries: object,
    datasetAspectBuilders?: AspectBuilder[],
    distributionAspectBuilders?: AspectBuilder[],
    organizationAspectBuilders?: AspectBuilder[],
    maxConcurrency?: number
}

interface CompiledAspects {
    parameterNames: string[];
    parameters: BuilderFunctionParameters;
    aspects: CompiledAspect[];
}

interface CompiledAspect {
    id: string,
    builderFunction: Function,
    setupResult: any
}

interface Aspects {
    [propName: string]: any;
}

interface ProblemReport {
    title: string,
    message?: string,
    additionalInfo?: any
}

interface ReportProblem {
    (title: string, message?: string, additionalInfo?: any): void
}

interface BuilderSetupFunctionParameters {
    /**
     * The connector that is building aspects.
     *
     * @type {JsonConnector}
     * @memberof BuilderFunctionParameters
     */
    connector: JsonConnector;

    /**
     * The source of this item for which we are building aspects.
     *
     * @type {Ckan}
     * @memberOf BuilderFunctionParameters
     */
    source: IConnectorSource;

    /**
     * The registry to be populated with records created from the CKAN datasets and resources.
     *
     * @type {Registry}
     * @memberOf BuilderSetupFunctionParameters
     */
    registry: Registry;

    /**
     * Provides access to utility libraries that may be helpful in setting up the builder.
     *
     * @type {BuilderFunctionLibraries}
     * @memberOf BuilderFunctionParameters
     */
    libraries: object;
}

abstract class BuilderFunctionParameters {
    /**
     * The result of invoking the {@link AspectBuilder#setupFunctionString}, or undefined if there is no
     * {@link AspectBuilder#setupFunctionString} defined for this builder.
     *
     * @type {*}
     * @memberOf BuilderFunctionParameters
     */
    setup: any = undefined;

    /**
     * The connector that is building aspects.
     *
     * @type {JsonConnector}
     * @memberof BuilderFunctionParameters
     */
    connector: JsonConnector;

    /**
     * The source of this item for which we are building aspects.
     *
     * @type {IConnectorSource}
     * @memberOf BuilderFunctionParameters
     */
    source: IConnectorSource = undefined;

    /**
     * The registry to be populated with records created from the CKAN datasets and resources.
     *
     * @type {Registry}
     * @memberOf BuilderSetupFunctionParameters
     */
    registry: Registry = undefined;

    /**
     * Reports a non-fatal problem creating an aspect.
     *
     * @type {ReportProblem}
     * @memberOf BuilderFunctionParameters
     */
    reportProblem: ReportProblem = undefined;

    /**
     * Provides access to utility libraries that may be helpful in building aspects.
     *
     * @type {BuilderFunctionLibraries}
     * @memberOf BuilderFunctionParameters
     */
    libraries: object = undefined;

    [propName: string]: any;
}

class DatasetBuilderFunctionParameters extends BuilderFunctionParameters {
    /**
     * The JSON dataset from which to build aspects.
     *
     * @type {object}
     * @memberOf DatasetBuilderFunctionParameters
     */
    dataset: object = undefined;
}

class DistributionBuilderFunctionParameters extends BuilderFunctionParameters {
    /**
     * The JSON distribution from which to build aspects.
     *
     * @type {object}
     * @memberOf DistributionBuilderFunctionParameters
     */
    distribution: object = undefined;

    /**
     * The JSON dataset that owns the distribution.
     *
     * @type {object}
     * @memberOf DatasetBuilderFunctionParameters
     */
    dataset: object = undefined;
}

class OrganizationBuilderFunctionParameters extends BuilderFunctionParameters {
    /**
     * The JSON organization from which to build aspects.
     *
     * @type {object}
     * @memberOf OrganizationBuilderFunctionParameters
     */
    organization: object = undefined;
}
