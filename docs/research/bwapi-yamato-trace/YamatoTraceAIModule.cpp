// Research-only BWAPI skeleton for measuring Yamato Gun timing.
// Copy into a BWAPI AIModule project and adapt setup/spawn assumptions to the test map.

#include <BWAPI.h>
#include <cstdlib>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <string>

namespace {
constexpr const char* Schema = "rts.bwapi.yamato-timing.v1";
constexpr const char* Scenario = "baseline";

std::ofstream trace;
BWAPI::Unit caster = nullptr;
BWAPI::Unit target = nullptr;
int commandFrame = -1;
int energySpentFrame = -1;
int targetDamagedFrame = -1;
int initialEnergy = -1;
int initialTargetHp = -1;
bool commandIssued = false;
bool commandAccepted = false;
bool scenarioEnded = false;

std::string tracePath() {
  const char* configuredPath = std::getenv("YAMATO_TRACE_PATH");
  if (configuredPath && configuredPath[0] != 0) return configuredPath;
  return "bwapi-yamato-trace.jsonl";
}

std::string escape(const std::string& value) {
  std::ostringstream out;
  for (const char ch : value) {
    if (ch == '\\' || ch == '"') out << '\\';
    out << ch;
  }
  return out.str();
}

void emit(const std::string& event, bool interruptionIssued = false) {
  if (!trace.is_open()) return;
  const int frame = BWAPI::Broodwar->getFrameCount();
  trace
    << "{"
    << "\"schema\":\"" << Schema << "\","
    << "\"scenario\":\"" << Scenario << "\","
    << "\"frame\":" << frame << ","
    << "\"event\":\"" << escape(event) << "\",";

  if (caster) {
    trace
      << "\"casterId\":" << caster->getID() << ","
      << "\"casterExists\":" << (caster->exists() ? "true" : "false") << ","
      << "\"casterOrder\":\"" << escape(caster->getOrder().c_str()) << "\","
      << "\"casterSecondaryOrder\":\"" << escape(caster->getSecondaryOrder().c_str()) << "\","
      << "\"casterEnergy\":" << caster->getEnergy() << ",";
  }
  if (target) {
    trace
      << "\"targetId\":" << target->getID() << ","
      << "\"targetExists\":" << (target->exists() ? "true" : "false") << ","
      << "\"targetHp\":" << target->getHitPoints() << ",";
  }

  trace
    << "\"commandAccepted\":" << (commandAccepted ? "true" : "false") << ","
    << "\"interruptionIssued\":" << (interruptionIssued ? "true" : "false")
    << "}\n";
  trace.flush();
}

void findUnits() {
  for (auto unit : BWAPI::Broodwar->self()->getUnits()) {
    if (unit->getType() == BWAPI::UnitTypes::Terran_Battlecruiser) caster = unit;
  }
  for (auto unit : BWAPI::Broodwar->getAllUnits()) {
    if (unit->getType() == BWAPI::UnitTypes::Zerg_Hatchery) target = unit;
  }
}
}

class YamatoTraceAIModule final : public BWAPI::AIModule {
public:
  void onStart() override {
    BWAPI::Broodwar->setLocalSpeed(0);
    BWAPI::Broodwar->enableFlag(BWAPI::Flag::CompleteMapInformation);
    trace.open(tracePath().c_str(), std::ios::out | std::ios::trunc);
    findUnits();
    if (!caster || !target) {
      BWAPI::Broodwar->printf("Yamato trace setup missing Battlecruiser or Hatchery");
      return;
    }
    initialEnergy = caster->getEnergy();
    initialTargetHp = target->getHitPoints();
    emit("scenario-start");
  }

  void onFrame() override {
    if (scenarioEnded) return;
    if (!caster || !target) {
      findUnits();
      if (!caster || !target) return;
    }

    if (!commandIssued) {
      commandAccepted = caster->useTech(BWAPI::TechTypes::Yamato_Gun, target);
      commandFrame = BWAPI::Broodwar->getFrameCount();
      commandIssued = true;
      emit("command-issued");
      return;
    }

    if (energySpentFrame < 0 && caster->exists() && caster->getEnergy() < initialEnergy) {
      energySpentFrame = BWAPI::Broodwar->getFrameCount();
      emit("energy-spent");
    }

    if (targetDamagedFrame < 0 && target->exists() && target->getHitPoints() < initialTargetHp) {
      targetDamagedFrame = BWAPI::Broodwar->getFrameCount();
      emit("target-damaged");
    }

    const int frame = BWAPI::Broodwar->getFrameCount();
    if ((targetDamagedFrame >= 0 && frame > targetDamagedFrame + 8) || frame > commandFrame + 240) {
      emit("scenario-end");
      scenarioEnded = true;
      BWAPI::Broodwar->leaveGame();
    }
  }
};

extern "C" __declspec(dllexport) void gameInit(BWAPI::Game* game) {
  BWAPI::BroodwarPtr = game;
}

extern "C" __declspec(dllexport) BWAPI::AIModule* newAIModule() {
  return new YamatoTraceAIModule();
}
