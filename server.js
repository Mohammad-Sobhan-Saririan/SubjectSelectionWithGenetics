const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { log } = require('console');
const { exec } = require('child_process');

// Check if the app is packaged by pkg or is running in development mode
const isPkg = typeof process.pkg !== 'undefined';
const basePath = isPkg ? path.dirname(process.execPath) : __dirname;
let BestChromosome = {
    chromosome: [],
    fitness: 0
};

const app = express();
const PORT = 3000;

// Middlewares
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));


class Subject {
    constructor(id, name, date, capacity, isForDouble) {
        this.id = id;
        this.name = name;
        this.date = date;
        this.capacity = capacity;
        this.isForDouble = isForDouble;
        this.assignedGroups = [];
    }

    isAvailable() {
        return this.assignedGroups.length < 1;
    }

    assignGroup(groupName) {
        if (this.isAvailable()) {
            this.assignedGroups.push(groupName);
        } else {
            throw new Error(`Subject ${this.name} is fully assigned.`);
        }
    }

    reserSubjects() {
        this.assignedGroups = [];
    }
}

class Group {
    constructor(name, priorities, problemDates, numberOfmembers) {
        this.name = name;
        this.priorities = priorities;
        this.problemDates = problemDates;
        this.numberOfmembers = numberOfmembers;
    }
    hasDateConflict(subject) {
        return this.problemDates.includes(subject.date);
    }
}


function loadJSONFile(fileName) {
    const filePath = path.join(basePath, `/public/${fileName}.json`);
    const data = fs.existsSync(filePath) ? fs.readFileSync(filePath).toString().trim() : '[]';
    return data ? JSON.parse(data) : [];
}


function saveJSONFile(data, fileName) {
    const filePath = path.join(basePath, `/public/${fileName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadSubjects() {
    return loadJSONFile('subjects').map(subject => new Subject(subject.id, subject.name, subject.date, subject.capacity, subject.isForDouble));
}

function saveSubjects(subjects) {
    saveJSONFile(subjects, 'subjects');
}
function saveAvailableSubjects(subjects) {
    saveJSONFile(subjects, 'AvailableSubjects');
}

function loadGroups() {
    return loadJSONFile('groups').map(group => new Group(group.name, group.priorities, group.problemDates, group.numberOfmembers));
}

function saveGroups(groups) {
    saveJSONFile(groups, 'groups');
}
function saveAvailableGroups(groups) {
    saveJSONFile(groups, 'AvailableGroups');
}
// API
app.get('/subjects', (req, res) => {
    const subjects = loadSubjects();
    res.json(subjects);
});

app.post('/add-group', (req, res) => {
    const { name, priorities, problemDates, numberOfmembers } = req.body;
    if (!name || !priorities || !problemDates || numberOfmembers == null) {
        return res.status(400).json({ error: 'اطلاعات کامل نیست.' });
    }
    const groups = loadGroups();
    const newGroup = { name, priorities, problemDates, numberOfmembers };
    groups.push(newGroup);
    saveGroups(groups);
    res.json({ message: `گروه ${name} با موفقیت اضافه شد.` });
});
// Groups & Subjects 
const subjects = loadJSONFile('subjects').map(subject => new Subject(subject.id, subject.name, subject.date, subject.capacity, subject.isForDouble));
const groups = loadJSONFile('groups').map(group => new Group(group.name, group.priorities, group.problemDates, group.numberOfmembers)).sort((a, b) => parseInt(a.name.split('--')[1].split('*')[0]) - parseInt(b.name.split('--')[1].split('*')[0]));

// Genetic Algorithm Parameters
let POPULATION_SIZE = 19;
let MUTATION_RATE = 0.1;
let CrossoverRate = 0.8;
let GENERATIONS = 5000;
let GeneticReapeat = 10;

// Function to create a random chromosome
function createChromosome() {
    let chromosome = new Array(groups.length).fill(null);
    let notAssignedGroups = [...groups].sort((a, b) => parseInt(a.name.split('--')[1].split('*')[1]) - parseInt(b.name.split('--')[1].split('*')[1]));
    subjects.forEach(subject => subject.reserSubjects());
    // First, assign subjects to groups based on their priorities , and double groups can only assign to double subjects
    // divide to 2 groups , double and more than double
    let availableSubjects = subjects.filter(s => s.isAvailable());

    for (let i = 0; i < availableSubjects.length; i++) {
        let subject = availableSubjects[i];

        // Find groups that prioritize this subject
        let groupsWithPriority = notAssignedGroups.filter(group => group.priorities.includes(subject.id));

        // If no group prioritizes this subject, skip it
        if (groupsWithPriority.length === 0) {
            // console.log(`Subject: ${subject.name} - No Group with Priority`);
            // console.log(`iteration : ${i}`);
            continue;  // Skip to the next iteration
        }

        // console.log(`Subject: ${subject.name} - Groups: ${groupsWithPriority.map(g => g.name)}`);

        // Handle non-double subjects
        if (!subject.isForDouble) {
            // Randomly assign the subject to one of the prioritized groups
            let randomIndex = Math.floor(Math.random() * groupsWithPriority.length);
            let group = groupsWithPriority[randomIndex];
            let groupIndex = groups.indexOf(group);

            // Assign the subject to the group and update the chromosome
            chromosome[groupIndex] = subject.id;
            subject.assignGroup(group.name);

            // Remove the assigned group from the list of available groups
            notAssignedGroups = notAssignedGroups.filter(g => g.name !== group.name);

            continue;  // Proceed to the next subject
        }

        // Handle double subjects
        if (subject.isForDouble) {
            let doubleGroups = notAssignedGroups.filter(group => group.numberOfmembers === "2");

            // If no double groups are available, skip this subject
            if (doubleGroups.length === 0) {
                // console.log(`Subject: ${subject.name} - No Double Groups Available`);
                continue;  // Skip to the next iteration
            }

            // console.log(`Subject: ${subject.name} - Double Groups: ${doubleGroups.map(g => g.name)}`);

            // Randomly assign the subject to a double group
            let randomIndex = Math.floor(Math.random() * doubleGroups.length);
            let group = doubleGroups[randomIndex];
            let groupIndex = groups.indexOf(group);

            // Assign the subject to the group and update the chromosome
            chromosome[groupIndex] = subject.id;
            subject.assignGroup(group.name);

            // Remove the assigned group from the list of available groups
            notAssignedGroups = notAssignedGroups.filter(g => g.name !== group.name);
        }
    }
    //     availableSubjects = subjects.filter(s => s.isAvailable());
    //     // for all the subjects that are not assigned to any group , if there is no group that has the priority of the subject , then break the loop
    //     if (availableSubjects.length > 0 && notAssignedGroups.filter(g => g.priorities.some(p => availableSubjects.map(s => s.id).includes(p))).length === 0) {
    //         break;
    //     }
    // }
    if (notAssignedGroups.length > 0) {
        //randomly assign the rest of the subjects to the groups
        availableSubjects = subjects.filter(s => s.isAvailable());

    }
    // now all the subjects are assigned to the groups randomly , done
    // console.log(`Return Chromosome: ${JSON.stringify(chromosome)} - Fitness: ${calculateFitness(chromosome)}`);
    return chromosome;
}

// Fitness function to calculate the fitness of a chromosome
function calculateFitness(chromosome) {
    let fitness = 0;
    /*
    THE Limitation for the chromosome:
    1. The chromosome should not include null values.
    2. The subjects with capacity 1 should not be assigned to more than one group.
    3. The subjects with capacity 1 should be assigned exactly to one group .
    4. The subjects should not be assigned to more groups than their capacity.
    5. the subjects that are for double groups should be assigned to double groups only.
    6. The subjects that are not for double groups should be assigned to groups that members are more than 2.
    */
    if (
        // Rule 1: No null values allowed in chromosome
        chromosome.includes(null) ||
        // Rule 2: Subjects with capacity 1 should not be assigned to more than one group
        subjects.filter(s => s.capacity === 1).some(s => chromosome.filter(c => c === s.id).length > 1) ||
        // // Rule 3: Subjects with capacity 1 should be assigned exactly to one group
        // subjects.filter(s => s.capacity === 1).some(s => !chromosome.includes(s.id)) ||
        // Rule 4: No subject should be assigned to more groups than its capacity
        subjects.some(s => chromosome.filter(c => c === s.id).length > s.capacity) ||
        // Rule 5: Subjects marked for double groups should be assigned to double groups only
        subjects.filter(s => s.isForDouble).some(s => {
            return !chromosome.includes(s.id) ||
                chromosome.filter(c => c === s.id).length > 1
        }) ||
        // Rule 6: Subjects not for double groups should not be assigned to groups with less than 2 members
        subjects.filter(s => !s.isForDouble).some(s => {
            return chromosome.includes(s.id) && groups[chromosome.indexOf(s.id)].numberOfmembers <= 2
        })
    ) {
        // caculate the number of subjects that are duplicated in the chromosome
        let duplicatedSubjects = chromosome.filter((subjectId, index) => chromosome.indexOf(subjectId) !== index);
        fitness -= 100 * duplicatedSubjects.length;
    }
    chromosome.forEach((subjectId, groupIndex) => {
        if (subjectId !== null) {
            let group = groups[groupIndex];
            let subject = subjects.find(s => s.id === subjectId);
            // Increase fitness for each assigned subject
            if (group.priorities.includes(subject.id)) {
                let priorityIndex = group.priorities.indexOf(subject.id) + 1;
                fitness += subjects.length - priorityIndex; // Increase fitness by formula Root(Root((Total Subjects - Priority Index) ^ 3))
            }
            // Decrease fitness for each problem date , 50 is a penalty for date conflict
            else {
                fitness -= 30;
            }
        }
    });
    return fitness;
}

// Making the initial population
function createInitialPopulation() {
    let array = Array.from({ length: POPULATION_SIZE }, () => {
        let chromosome = createChromosome();
        while (calculateFitness(chromosome) < 0) {
            chromosome = createChromosome();
        }
        return { chromosome, fitness: calculateFitness(chromosome) };
    });
    return array;
}

// Rank Selection Method for selecting parents
function selectParents(population) {
    // Sort population by fitness in ascending order
    population.sort((a, b) => a.fitness - b.fitness);

    // Rank each individual (higher rank for higher fitness)
    let totalRank = (POPULATION_SIZE * (POPULATION_SIZE + 1)) / 2;
    let selectionProbability = population.map((individual, index) => (index + 1) / totalRank);

    // Helper function to select one parent based on rank
    function selectParent() {
        let random = Math.random();
        let cumulative = 0;
        for (let i = 0; i < selectionProbability.length; i++) {
            cumulative += selectionProbability[i];
            if (random < cumulative) return population[i];
        }
    }

    let parent1 = selectParent();
    let parent2 = selectParent();
    return [parent1, parent2];
}

// Crossover function to combine two parents
function crossover(parent1, parent2) {
    let crossoverPoint = Math.floor(Math.random() * parent1.chromosome.length);
    let childChromosome = [
        ...parent1.chromosome.slice(0, crossoverPoint),
        ...parent2.chromosome.slice(crossoverPoint)
    ];
    let repeat = 100;
    /*
    THE Limitation for the chromosome:
    1. The chromosome should not include null values.
    2. The subjects with capacity 1 should not be assigned to more than one group.
    3. The subjects with capacity 1 should be assigned exactly to one group .
    4. The subjects should not be assigned to more groups than their capacity.
    5. the subjects that are for double groups should be assigned to double groups only.
    6. The subjects that are not for double groups should be assigned to groups that members are more than 2.
    */
    while (
        (
            // Rule 1: No null values allowed in chromosome
            childChromosome.includes(null) ||
            // Rule 2: Subjects with capacity 1 should not be assigned to more than one group
            subjects.filter(s => s.capacity === 1).some(s => childChromosome.filter(c => c === s.id).length > 1) ||
            // // Rule 3: Subjects with capacity 1 should be assigned exactly to one group
            // subjects.filter(s => s.capacity === 1).some(s => !childChromosome.includes(s.id)) ||
            // Rule 4: No subject should be assigned to more groups than its capacity
            subjects.some(s => childChromosome.filter(c => c === s.id).length > s.capacity) ||
            // Rule 5: Subjects marked for double groups should be assigned to double groups only
            subjects.filter(s => s.isForDouble).some(s => {
                return !childChromosome.includes(s.id) ||
                    childChromosome.filter(c => c === s.id).length > 1
            }) ||
            // Rule 6: Subjects not for double groups should not be assigned to groups with less than 2 members
            subjects.filter(s => !s.isForDouble).some(s => {
                return childChromosome.includes(s.id) && groups[childChromosome.indexOf(s.id)].numberOfmembers <= 2
            })
        ) &&
        repeat-- > 0) {
        crossoverPoint = Math.floor(Math.random() * parent1.chromosome.length);
        childChromosome = [
            ...parent1.chromosome.slice(0, crossoverPoint),
            ...parent2.chromosome.slice(crossoverPoint)
        ];
    }
    if (repeat === 0) {
        childChromosome = createChromosome();
    }

    return { chromosome: childChromosome, fitness: calculateFitness(childChromosome) };
}

// Mutation function to change a random gene in the chromosome
function mutate(chromosome) {
    if (Math.random() < MUTATION_RATE) {
        let mutationPoint = Math.floor(Math.random() * chromosome.length);
        let newSubjectId = subjects[Math.floor(Math.random() * subjects.length)].id;
        chromosome[mutationPoint] = newSubjectId;
    }
}

// Evolution function to create a new population
function evolve(population) {
    let newPopulation = [];

    for (let i = 0; i < POPULATION_SIZE / 2; i++) {
        let [parent1, parent2] = selectParents(population);

        let child1;
        let child2;
        if (Math.random() < CrossoverRate) {
            let children = crossover(parent1, parent2);
            child1 = children;
            children = crossover(parent1, parent2);
            child2 = children;
        } else {
            child1 = parent1;
            child2 = parent2;
        }
        mutate(child1.chromosome);
        mutate(child2.chromosome);

        child1.fitness = calculateFitness(child1.chromosome);
        child2.fitness = calculateFitness(child2.chromosome);
        newPopulation.push(child1, child2);
    }

    return newPopulation;
}

// Genetic Algorithm function
function geneticAlgorithm() {
    let population = createInitialPopulation();
    for (let generation = 0; generation < GENERATIONS; generation++) {
        // console.log(`Generation ${generation + 1}`);
        // population.forEach(individual => console.log(`Chromosome: ${JSON.stringify(individual.chromosome)}, Fitness: ${individual.fitness}`));
        // return;
        let bestChromosome = population.reduce((best, current) => current.fitness > best.fitness ? current : best, population[0]); // best chromosome in the population that has the highest fitness
        BestChromosome = BestChromosome.fitness > bestChromosome.fitness ? BestChromosome : bestChromosome;
        population = evolve(population);
        // CrossoverRate = CrossoverRate + (0.7) * 10 ** -5;
        // MUTATION_RATE = MUTATION_RATE - (0.8) * 10 ** -5;
    }

    // Find the best individual in the final population
    let bestIndividual = population.reduce((best, current) => current.fitness > best.fitness ? current : best, population[0]);
    // console.log(`Best Solution: ${JSON.stringify(bestIndividual.chromosome)}, Fitness: ${bestIndividual.fitness}`);
    // console.log(`Best Chromosome: ${JSON.stringify(BestChromosome.chromosome)}, Fitness: ${BestChromosome.fitness}\n`);
    return bestIndividual;
}
// API to get the lottery results
app.get('/get-lottery-results', (req, res) => {
    // log time
    // console.log(`Start Time : ${new Date().toLocaleTimeString()}`);
    let StartTimer = new Date().toLocaleTimeString();
    let repeat = GeneticReapeat;
    let bestSolution = geneticAlgorithm();
    // console.log(`Best Solution: ${JSON.stringify(bestSolution)}`);
    while (
        (bestSolution.chromosome.includes(null) ||
            subjects.filter(s => s.capacity === 1).some(s => bestSolution.chromosome.filter(c => c === s.id).length > 1) ||
            // subjects.filter(s => s.capacity === 1).some(s => !bestSolution.chromosome.includes(s.id)) ||
            subjects.some(s => bestSolution.chromosome.filter(c => c === s.id).length > s.capacity)) ||
        repeat-- > 0) {
        if (!(bestSolution.chromosome.includes(null) ||
            subjects.filter(s => s.capacity === 1).some(s => bestSolution.chromosome.filter(c => c === s.id).length > 1) ||
            // subjects.filter(s => s.capacity === 1).some(s => !bestSolution.chromosome.includes(s.id)) ||
            subjects.some(s => bestSolution.chromosome.filter(c => c === s.id).length > s.capacity))) {
            BestChromosome = BestChromosome.fitness > bestSolution.fitness ? BestChromosome : bestSolution;
        }
        bestSolution = geneticAlgorithm();
    }
    bestSolution = BestChromosome;
    log(`Most Best Solution: ${JSON.stringify(bestSolution)} - Fitness: ${bestSolution.fitness}`);
    let EndTimer = new Date().toLocaleTimeString();
    // console.log(`Start Time : ${StartTimer} - End Time : ${EndTimer}`);
    let result = [];
    bestSolution.chromosome.forEach((subjectId, groupIndex) => {
        if (subjectId !== null) {
            let group = groups[groupIndex];
            let subject = subjects.find(s => s.id === subjectId);
            result.push({ group: group.name, subject: subject.name, date: subject.date });
        }
    });
    res.json(result);

});
// API to get Groups
app.get('/groups', (req, res) => {
    const groups = loadGroups();
    res.json(groups);
});

// API to remove a group
app.post('/remove-group', (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'اطلاعات کامل نیست.' });
    }
    const groups = loadGroups();
    const newGroups = groups.filter(group => group.name !== name);
    saveGroups(newGroups);
    res.json({ message: `گروه ${name} با موفقیت حذف شد.` });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    /* initialize the Global Variables */
    MUTATION_RATE = 0.2;
    CrossoverRate = 0.8;
    BestChromosome = {
        chromosome: [],
        fitness: 0
    };
    GENERATIONS = 1000;
    GeneticReapeat = 20;
    POPULATION_SIZE = 14;

    // Open the browser after the server starts
    exec(`start http://localhost:${PORT}/client.html`, (err) => {
        if (err) {
            console.error('Failed to open browser:', err);
        }
    });
});
