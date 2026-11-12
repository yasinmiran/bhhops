const ADJECTIVES = [
  "Sleepy", "Plucky", "Brave", "Curious", "Nimble", "Fuzzy", "Jolly", "Mighty", "Sneaky", "Cosmic",
  "Zesty", "Wobbly", "Bouncy", "Dapper", "Giddy", "Lucky", "Witty", "Rowdy", "Snappy", "Breezy",
  "Chirpy", "Feisty", "Groovy", "Jazzy", "Peppy", "Quirky", "Sunny", "Zippy", "Tidy", "Bold",
  "Calm", "Eager", "Fancy", "Gentle", "Happy", "Keen", "Merry", "Noble", "Proud", "Swift",
];

const NOUNS = [
  "Plasmid", "Codon", "Ribosome", "Genome", "Enzyme", "Protein", "Peptide", "Helix", "Primer", "Contig",
  "Exon", "Intron", "Kinase", "Ligand", "Neuron", "Operon", "Phage", "Vector", "Allele", "Histone",
  "Cytosine", "Guanine", "Thymine", "Adenine", "Uracil", "Tardigrade", "Axolotl", "Zebrafish", "Yeast", "Microbe",
  "Amoeba", "Diatom", "Lichen", "Spore", "Nematode", "Fruitfly", "Pipeline", "Workflow", "Ontology", "Container",
  "Notebook", "Kernel", "Parser", "Schema", "Dataset", "Galaxy", "Organoid", "Chromosome",
];

const pick = (words: string[]) => words[Math.floor(Math.random() * words.length)];

/** A leaderboard name such as "Plucky Ribosome". The longest pair still fits the server's 20 characters. */
export const randomName = () => `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
