import { beforeEach,describe,it,expect,vi } from "vitest";
import { Hono,type Context,type Next } from "hono";
const stores=vi.hoisted(()=>({view:vi.fn(async()=>({})),context:vi.fn(async()=>({})),decide:vi.fn(async()=>({outcome:"applied",reason:"applied"}))}));
vi.mock("../../src/db/planning-repository.js",()=>({planningRepositories:()=>({gates:stores})}));
vi.mock("../../src/auth/local-mode.js",()=>({isLocalModeRequest:(c:Context)=>c.get("fixtureLocal" as never)===true}));
vi.mock("../../src/auth/team-role.js",()=>({requireTeamRole:()=>async(c:Context,next:Next)=>{c.set("teamRole" as never,"leader" as never);c.set("actingUserId" as never,c.get("userId" as never));await next();}}));
import { sprintGateRoutes } from "../../modules/task/sprint-gates/routes.js";
function app(identity:{userId?:string;apiClientId?:string;local?:boolean}){const app=new Hono();app.use("*",async(c,next)=>{if(identity.userId)c.set("userId" as never,identity.userId as never);if(identity.apiClientId)c.set("apiClientId" as never,identity.apiClientId as never);c.set("fixtureLocal" as never,Boolean(identity.local) as never);await next();});app.route("/api/teams",sprintGateRoutes);return app;}
const body={eventId:"stable-id",action:"approve",expectedRevision:1,sourceFingerprint:"a".repeat(64),reason:"I reviewed this snapshot"};
const path="/api/teams/team/planning/sprints/sprint/phase";
beforeEach(()=>vi.clearAllMocks());
describe("Human session boundary",()=>{
 for(const identity of [{},{userId:"anonymous"},{userId:"actio-local"},{userId:"looks-human",local:true},{userId:"leader",apiClientId:"service"}]){
  it("refuses non-human authority "+JSON.stringify(identity),async()=>{
   const response=await app(identity).request(path+"/decisions",{method:"POST",headers:{"content-type":"application/json","X-Decided-By":"leader"},body:JSON.stringify(body)});
   expect(response.status).toBe(403);expect(stores.decide).not.toHaveBeenCalled();
   const context=await app(identity).request(path+"/context",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({expectedRevision:1,sourceFingerprint:body.sourceFingerprint,retrospective:"review",nextSprintId:null,reason:"draft"})});
   expect(context.status).toBe(403);expect(stores.context).not.toHaveBeenCalled();
  });
 }
 it("retains event id and real authenticated actor for a leader",async()=>{
  const response=await app({userId:"cernere-user"}).request(path+"/decisions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  expect(response.status).toBe(200);expect(stores.decide).toHaveBeenCalledWith("team","sprint","cernere-user",expect.objectContaining({eventId:"ui:stable-id"}),expect.any(Date),true);
 });
});
