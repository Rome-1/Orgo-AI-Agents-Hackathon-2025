import { Computer } from 'orgo';

let computer: Computer | null = null;

/** Lazily create or reuse the single shared VM */
export async function getComputer() {
  if (!computer) {
    computer = await Computer.create({ projectId: process.env.ORGO_PROJECT_ID });
  }
  return computer;
}

export async function resetComputer() {
  if (computer) {
    await computer.restart(); // reboot but keep the same node
  }
}

export async function destroyComputer() {
    console.log('Destroying computer');
    console.error("You shouldn't be calling this function");
    throw new Error("You shouldn't be deleting the computer");
    // if (computer) {
    //     await computer.destroy();
    //     computer = null;
    // }
} 